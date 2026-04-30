/* MMD Model Console - production events-worker integration */
(function(){
  const root = document.getElementById("mmd-model-console");
  if(!root) return;

  const qs = new URLSearchParams(location.search);
  const t = qs.get("t") || root.dataset.t || "";
  const sessionId = qs.get("session_id") || root.dataset.sessionId || "";
  const jobId = qs.get("job_id") || root.dataset.jobId || "";
  const eventsBase = (root.dataset.eventsBase || "/events-worker").replace(/\/+$/, "");
  const confirmKey = root.dataset.confirmKey || "";

  const $ = (id) => document.getElementById(id);
  const state = { watchId:null, last:null, lastSentAt:0, sending:false };

  function text(id, value){ const el=$(id); if(el) el.textContent = value || "-"; }
  function status(title, body){ text("mmdModelStatusTitle", title); text("mmdModelStatusText", body); }
  function now(){ return new Date().toISOString(); }
  function displayTime(){ return new Date().toLocaleString("th-TH", { hour:"2-digit", minute:"2-digit", day:"2-digit", month:"short" }); }
  function mapsUrl(lat,lng){ return "https://www.google.com/maps?q=" + encodeURIComponent(lat + "," + lng); }

  function setLive(on){
    text("mmdLiveState", on ? "ON" : "OFF");
    text("mmdLiveTitle", on ? "Live location on" : "Live location off");
    text("mmdLiveLine", on ? "Live monitoring is active" : "Live monitoring is off");
    text("mmdLiveText", on ? "กำลังแชร์ตำแหน่งล่าสุดครับ ระบบจะใช้ตำแหน่งนี้เพื่อแจ้ง ETA ให้ลูกค้า" : "ยังไม่ได้แชร์ตำแหน่งครับ กด Start Live Location หรือ START ROUTE เพื่อเริ่ม");
    const dot = $("mmdLiveDot"); if(dot) dot.classList.toggle("is-on", !!on);
    const badge = $("mmdLiveBadge");
    if(badge){ badge.textContent = on ? "LIVE ON" : "LIVE OFF"; badge.classList.toggle("live-on", !!on); }
    const card = root.querySelector(".mmdmodel-card.live"); if(card) card.classList.toggle("is-live-on", !!on);
  }
  window.setLive = setLive;

  async function postEvent(event, payload){
    const body = {
      t,
      session_id: sessionId,
      job_id: jobId,
      event,
      source: "model_console",
      idempotency_key: `${sessionId || jobId || t}:${event}:${Math.floor(Date.now()/15000)}`,
      ...payload
    };
    const headers = { "Content-Type":"application/json" };
    if(confirmKey) headers["X-Confirm-Key"] = confirmKey;
    const res = await fetch(eventsBase + "/v1/model/console/event", { method:"POST", headers, body:JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.ok === false) throw new Error(data.error || "events_worker_failed");
    return data;
  }

  async function updateTimeline(event, message){
    status("Updating command.", "กำลังส่งสถานะเข้า events-worker ครับ…");
    try{
      await postEvent(event, { ts: now(), message });
      text("mmdSessionStatus", event);
      status(message || "Status updated.", "ส่งสถานะเข้า events-worker แล้วครับ");
    }catch(err){
      console.error(err);
      status("Update failed.", "ส่ง events-worker ไม่สำเร็จครับ ตรวจ token / endpoint / auth อีกครั้ง");
    }
  }

  function etaText(){ return "ETA ประมาณ 18–25 นาที จากตำแหน่งล่าสุด"; }

  async function sendLocation(pos, eventName){
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = Math.round(pos.coords.accuracy || 0);
    const ts = now();
    state.last = { lat, lng, accuracy, ts, live_map_url: mapsUrl(lat,lng), eta_text: etaText() };

    setLive(true);
    text("mmdLastUpdate", displayTime());
    text("mmdEtaText", state.last.eta_text);

    const nowMs = Date.now();
    if(nowMs - state.lastSentAt < 12000 || state.sending) return;
    state.lastSentAt = nowMs;
    state.sending = true;
    try{
      await postEvent(eventName || "live_location_update", state.last);
      status("Live location active.", "ส่งตำแหน่งล่าสุดเข้า events-worker แล้วครับ");
    }catch(err){
      console.error(err);
      status("Location local only.", "แสดงตำแหน่งในหน้านี้แล้ว แต่ส่งเข้า events-worker ไม่สำเร็จครับ");
    }finally{
      state.sending = false;
    }
  }

  function startLive(){
    if(!navigator.geolocation){ status("Location unavailable.", "อุปกรณ์นี้ไม่รองรับ geolocation ครับ"); return; }
    status("Requesting location.", "กำลังขอสิทธิ์ตำแหน่งครับ…");
    if(state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = navigator.geolocation.watchPosition(
      (pos) => sendLocation(pos, "live_location_update"),
      (err) => { console.error(err); status("Location blocked.", "เปิด Location ใน browser ก่อนครับ"); },
      { enableHighAccuracy:true, maximumAge:10000, timeout:12000 }
    );
  }

  function stopLive(){
    if(state.watchId !== null){ navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
    setLive(false);
    postEvent("live_location_stopped", { ts: now() }).catch(console.error);
    status("Live location stopped.", "หยุดแชร์ตำแหน่งแล้วครับ");
  }

  function startRoute(){
    updateTimeline("en_route", "Route started.");
    startLive();
  }

  async function sendEta(){
    if(!state.last){ status("ETA unavailable.", "กด START ROUTE หรือ Start Live Location ก่อนครับ"); return; }
    try{
      await postEvent("eta_sent", state.last);
      status("ETA sent.", "ส่ง ETA ล่าสุดเข้า events-worker แล้วครับ");
    }catch(err){ console.error(err); status("ETA failed.", "ส่ง ETA ไม่สำเร็จครับ"); }
  }

  function bind(id, fn){ const el=$(id); if(el) el.addEventListener("click", fn); }
  bind("mmdStartRouteBtn", startRoute);
  bind("mmdStartRouteBtn2", startRoute);
  bind("mmdStartLiveBtn", startLive);
  bind("mmdStopLiveBtn", stopLive);
  bind("mmdSendEtaBtn", sendEta);
  bind("mmdArrivedBtn", () => updateTimeline("arrived", "Arrived at location."));
  bind("mmdDelayBtn", () => postEvent("delay_reported", { ts: now(), note:"Model reported delay" }).then(() => status("Delay reported.", "แจ้ง delay เข้า events-worker แล้วครับ")).catch(console.error));

  root.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      if(action === "work_started" && !confirm("Started จะล็อก session timeline ต้องการอัปเดตจริงไหม?")) return;
      updateTimeline(action, "Status updated.");
    });
  });

  setLive(false);
  status("Route not started.", "พร้อมใช้งานครับ อ่าน brief ให้ครบก่อนเริ่มเดินทาง");
})();
