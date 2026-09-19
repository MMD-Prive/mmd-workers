(function () {
  "use strict";

  var path = String(location.pathname || "").replace(/\/+$/, "") || "/";
  var params = new URLSearchParams(location.search || "");
  var token = params.get("t") || "";
  var target = "";

  function signedPay(t) {
    var url = new URL("/sigil/pay", location.origin);
    url.searchParams.set("t", t);
    return url.pathname + url.search;
  }

  function membershipEntry() {
    var url = new URL("/sigil/member/membership", location.origin);
    ["plan", "package", "tier", "code", "promo", "src", "campaign", "from"].forEach(function (key) {
      var value = params.get(key);
      if (value) url.searchParams.set(key, value);
    });
    return url.pathname + url.search + (location.hash || "");
  }

  if (path === "/sigil/pay/renew") {
    target = "/sigil/pay/renewal" + (location.search || "") + (location.hash || "");
  } else if (path === "/sigil/pay/membership") {
    target = token ? signedPay(token) : membershipEntry();
  } else if (path === "/sigil/pay/payment") {
    target = token ? signedPay(token) : "/member/payments";
  }

  if (target && target !== path + (location.search || "") + (location.hash || "")) {
    window.MMDLegacyPaymentRouteBridgeV1 = {
      from: path,
      to: target,
      canonical: true,
      updated: "2026-09-19",
    };
    location.replace(target);
  }
})();
