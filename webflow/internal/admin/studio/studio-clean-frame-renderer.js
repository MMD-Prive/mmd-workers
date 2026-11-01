/* Owner-edited opaque Studio artwork. Presentation only; no network writes. */
(function () {
  "use strict";

  var STYLE_ID = "mmd-studio-clean-frame-css-v1";
  function render(host, frame, photoStyle, values) {
    if (!host || !frame || !frame.url) throw new Error("studio_frame_asset_required");
    installStyles();
    host.replaceChildren();
    host.className = "mmd-studio-clean-frame";
    host.setAttribute("data-frame-asset", String(frame.number));
    host.setAttribute("data-master-frame", "mmd-v2");
    var artwork = document.createElement("img");
    artwork.className = "mmd-studio-frame-art";
    artwork.src = frame.url;
    artwork.alt = "";
    artwork.draggable = false;
    host.appendChild(artwork);

    // The original is opaque: keep it behind an inset photo, not in front of it.
    // Contain preserves the whole source image. No filters, masks or AI edits.
    var photo = document.createElement("div");
    photo.className = "mmd-studio-frame-photo";
    if (photoStyle && photoStyle !== "none") photo.style.backgroundImage = photoStyle;
    host.appendChild(photo);

    var exclusive = frame.field === "EMs" || frame.field === "GWs";
    if (exclusive) {
      var run = document.createElement("strong");
      run.className = "mmd-studio-frame-run mmd-studio-frame-run-" + frame.field.toLowerCase();
      run.setAttribute("aria-label", frame.field + " Run Number");
      var digits = String(values.run || "").replace(/\D/g, "").slice(-3);
      run.textContent = digits ? digits.padStart(3, "0") : "";
      host.appendChild(run);
    } else {
      var name = document.createElement("strong");
      name.className = "mmd-studio-frame-name";
      name.textContent = values.model || "MODEL NAME";
      name.style.fontSize = name.textContent.length > 24 ? "2.3cqw" : name.textContent.length > 15 ? "3cqw" : "3.8cqw";
      host.appendChild(name);
    }
    var metrics = document.createElement("div");
    metrics.className = "mmd-studio-frame-metrics";
    metrics.setAttribute("aria-label", "Height and weight");
    [values.height, values.weight].forEach(function (value) {
      var item = document.createElement("span");
      item.textContent = value || "—";
      metrics.appendChild(item);
    });
    host.appendChild(metrics);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ".mmd-studio-clean-frame{position:relative;isolation:isolate;container-type:inline-size;aspect-ratio:1316/1195;overflow:hidden;background:#000;color:#f7edda;font-family:Georgia,\"Noto Serif Thai\",serif}.mmd-studio-clean-frame *{box-sizing:border-box}.mmd-studio-frame-art{position:absolute;inset:0;z-index:0;display:block;width:100%;height:100%;object-fit:fill;pointer-events:none}.mmd-studio-frame-photo{position:absolute;z-index:1;left:7%;top:12%;width:64%;height:76%;background-size:contain;background-position:center;background-repeat:no-repeat;filter:none}.mmd-studio-frame-name{position:absolute;z-index:2;left:74%;top:14%;width:20%;line-height:1.12;font-weight:400;text-align:right;overflow-wrap:anywhere;white-space:pre-wrap}.mmd-studio-frame-metrics{position:absolute;z-index:2;left:74%;top:38%;width:20%;display:flex;justify-content:flex-end;gap:1.5cqw;font-size:3.4cqw;line-height:1.1;font-variant-numeric:tabular-nums}.mmd-studio-frame-run{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;font-size:3.2cqw;line-height:1;font-weight:400;font-variant-numeric:tabular-nums;letter-spacing:.12em;color:#f7edda}.mmd-studio-frame-run-ems{left:76.5%;top:19.9%;width:18.4%;height:4%}.mmd-studio-frame-run-gws{left:76.4%;top:21.5%;width:16.8%;height:5.5%}";
    document.head.appendChild(style);
  }

  window.MMDStudioCleanFrame = Object.freeze({ render: render });
})();
