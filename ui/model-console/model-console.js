// MMD Model Console LIVE logic
function setLive(on){
  document.getElementById("mmdLiveState").textContent = on?"ON":"OFF";
  document.getElementById("mmdLiveTitle").textContent = on?"Live location on":"Live location off";
  document.getElementById("mmdLiveLine").textContent = on?"Live monitoring is active":"Live monitoring is off";

  const dot = document.getElementById("mmdLiveDot");
  if(dot) dot.classList.toggle("is-on", on);

  const badge = document.getElementById("mmdLiveBadge");
  if(badge){
    badge.textContent = on?"LIVE ON":"LIVE OFF";
    badge.classList.toggle("live-on", on);
  }

  const liveCard = document.querySelector(".mmdmodel-card.live");
  if(liveCard){
    liveCard.classList.toggle("is-live-on", on);
  }
}
