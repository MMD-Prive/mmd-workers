(() => {
  "use strict";

  const root = document.getElementById("mmd-careback-six-v6");
  if (!root || root.dataset.perVoiceV2 === "1") return;
  root.dataset.perVoiceV2 = "1";

  // Use the real same-site member shell. Do not encode /member/liff inside liff.state;
  // that can duplicate the path when LINE opens the endpoint.
  const MEMBER_URL = "https://mmdbkk.com/member/liff?intent=status";
  const HYPE_URL = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a79c2a1213c008f8210dd4b_HYPE_Footer.webp";

  const copy = {
    th: {
      text: {
        heroLead: "6 ปีแล้วครับ บางช่วงเราใกล้กัน บางช่วงเปอร์ก็เงียบไป รอบนี้เปอร์อยากกลับมาดูแลทุกคนให้ดีขึ้นจริง ๆ",
        heroFine: "ยืนยันการเป็นสมาชิกเพื่อรับสิทธิพิเศษมากมาย อย่ามองข้ามนะครับ",
        checkMain: "ตรวจสิทธิ์ของฉันผ่าน LINE",
        introLead: "หน้านี้เปอร์ไม่ได้ทำไว้แค่บอกโปรโมชั่นนะครับ อยากให้เป็นที่รวมทั้งเรื่องที่ผ่านมา สิ่งที่กำลังแก้ และสิ่งที่อยากดูแลกลับให้ทุกคน",
        boundaryWish: "อยากฝากอะไรถึง MMD เขียนได้เลยครับ ทุกคนส่งได้ ไม่ต้องล็อกอิน",
        boundaryBenefits: "ส่วนคูปอง วันสมาชิก และ Points เดี๋ยวเช็กจากข้อมูลสมาชิกจริงผ่าน LINE ให้ครับ",
        letterTitle: "จดหมายจากเปอร์",
        letterHello: "สวัสดีทุกคนครับ",
        letter1: "ไม่ว่าตอนนี้จะยังเป็นสมาชิก เคยใช้บริการมาก่อน หรือเพิ่งรู้จัก MMD เป็นครั้งแรก ขอบคุณที่แวะมาอ่านนะครับ และนี่เป็นครั้งแรกที่เปอร์เปิดหน้าตาให้ทุกคนเห็นกันชัด ๆ",
        letter2: "ช่วง 6–8 เดือนที่ผ่านมา MMD ดูเงียบไปจริง ๆ ครับ แต่เปอร์ไม่ได้หายไปไหน เปอร์นั่งทำเว็บและไล่แก้หลายอย่างด้วยตัวเอง เพราะอยากให้ครั้งต่อไปทุกคนใช้งานง่ายกว่าเดิม",
        letter3: "เปอร์รู้ว่าที่ผ่านมาเคยตอบช้า หาโมเดลให้ไม่ทัน ลืมชื่อ หรือมีข้อมูลผิดบ้าง เรื่องพวกนี้เปอร์จำได้ครับ เลยอยากทำให้มันเป็นระเบียบขึ้นและลดความผิดพลาดให้มากที่สุด",
        letter4: "ตอนนี้งานไปได้ประมาณ 60–70% แล้วครับ เปอร์เขียนเว็บไม่เป็นตั้งแต่แรก ก็เลยค่อย ๆ เรียนและใช้ AI ช่วย สิ่งที่กินเวลาที่สุดคือเรื่องความปลอดภัยและการแยกข้อมูลให้ถูกคน ซึ่งเปอร์ไม่อยากรีบจนพลาด",
        letter5: "รอบวันเกิดก่อน เปอร์ตั้งใจทำหน้าอวยพรแต่โค้ดยังมีปัญหา หลายคนเลยส่งไม่ได้ รอบนี้เลยกลับมาแก้ใหม่ให้ Wish ส่งได้จริง และแยกเรื่อง Points กับวันสมาชิกออกไปตรวจจากข้อมูลจริงครับ",
        letter6: "ถ้ายืนยันตัวตนผ่าน LINE และผ่านเงื่อนไขที่เกี่ยวข้องครบ จะมีคูปองส่วนตัวสูงสุด 10% ให้ด้วยครับ ถือเป็นคำขอบคุณเล็ก ๆ จากเปอร์",
        letter7: "ยังมีอีกหลายอย่างที่เปอร์อยากทำให้ดีขึ้นครับ ขอบคุณที่ยังอยู่และยังให้โอกาส MMD ดูแลต่อ",
        letterQuote: "“ขอบคุณที่ยังอยู่ด้วยกันครับ”",
        benefitLead: "สิทธิ์ของแต่ละคนอาจไม่เหมือนกันนะครับ เดี๋ยวเช็กจากสถานะสมาชิกและข้อมูลที่ยืนยันได้จริง จะได้ไม่ให้ผิดคน",
        currentName: "สมาชิกปัจจุบัน",
        currentBody: "ถ้ายังเป็นสมาชิกอยู่ เปอร์เพิ่มให้ 180 วันจากวันหมดอายุจริง ส่วน Points จะคิดจากยอดที่ตรวจสอบได้ครับ",
        formerName: "เคยเป็นสมาชิก / หมดอายุ",
        formerBody: "ถ้ากลับมาต่อสมาชิก หลังยืนยันการต่ออายุเรียบร้อย รับเพิ่ม 90 วัน + 150 Points ตามเงื่อนไขครับ",
        newName: "เพื่อนใหม่",
        newBody: "เพิ่งรู้จักกันก็ยินดีต้อนรับครับ หลังสมัครและผ่านขั้นตอนแคมเปญ รับ Welcome 66 Points",
        couponTitle: "คูปองส่วนตัว สูงสุด 10%",
        couponBody: "คูปองจะขึ้นให้หลังยืนยัน LINE และเช็กเงื่อนไขครบครับ Wish อย่างเดียวจะยังไม่สร้างสิทธิ์อัตโนมัติ",
        wishLead: "ถ้ามีอะไรอยากฝากถึง MMD เขียนได้เลยครับ ไม่ต้องเป็นสมาชิก ไม่ต้องล็อกอิน และไม่ต้องรอเช็กสิทธิ์ก่อน",
        wishFine: "Wish เป็นพื้นที่สำหรับทุกคน ส่วนสิทธิ์สมาชิกเดี๋ยวแยกไปเช็กใน LINE ครับ",
        timelineCopy: "มีทั้งช่วงที่เราใกล้กันและช่วงที่เงียบไป แต่ทุกช่วงก็พา MMD มาถึงปีที่หกครับ",
        memoryLead: "เปอร์เก็บภาพพวกนี้ไว้ เพราะแต่ละภาพคือช่วงหนึ่งที่เราเคยอยู่ตรงนี้ด้วยกันจริง ๆ",
        kenjiLead: "ถ้าอยากรู้ว่าตอนนี้บัญชีของคุณมีสิทธิ์อะไรอยู่บ้าง เปิด LINE แล้วเช็กได้เลยครับ",
        kenjiBody: "เปอร์แยก Wish กับสิทธิ์สมาชิกออกจากกันนะครับ อวยพรได้ทุกคน ส่วนสิทธิ์จะดูจากข้อมูลสมาชิกจริงของแต่ละคน",
        finalLead: "เปอร์ยังมีอีกหลายอย่างที่อยากทำให้ดีขึ้น ถ้ายังอยู่ด้วยกัน เปอร์จะค่อย ๆ ทำให้ MMD ใช้ง่ายและดูแลทุกคนได้ดีขึ้นเรื่อย ๆ ครับ",
        navKenji: "เช็กสิทธิ์"
      },
      html: {
        heroTitle: "<span>6 Years.</span><em>CARE BACK.</em>",
        introTitle: "Six years,<br><em>still us.</em>",
        benefitTitle: "สิ่งที่เปอร์<br><em>อยากดูแลกลับ</em>",
        wishTitle: "ถ้ามีอะไรอยากบอก MMD<br><em>เขียนไว้ได้เลยครับ</em>",
        memoryTitle: "บางภาพ<br><em>ไม่ต้องมีคำอธิบายเยอะ</em>",
        kenjiTitle: "เรื่องสิทธิ์<br><em>เปิด LINE เช็กได้เลยครับ</em>",
        finalTitle: "ขอบคุณที่ยังอยู่ครับ<br><em>6 ปีแล้ว ไปต่อด้วยกันนะ</em>"
      }
    },
    en: {
      text: {
        heroLead: "Six years already. We have had close moments and quiet ones. This time, Per simply wants to come back and take better care of everyone.",
        heroFine: "Confirm your membership to see the benefits prepared for you. Don’t miss them.",
        checkMain: "Check my benefits in LINE",
        introLead: "This page is not just a promotion. It is a small place for what happened, what Per is fixing, and what MMD wants to give back.",
        boundaryWish: "Want to leave something for MMD? Write it anytime. No login is required.",
        boundaryBenefits: "Coupons, membership days and Points are checked separately from verified member information in LINE.",
        letterTitle: "A note from Per",
        letterHello: "Hi everyone.",
        benefitLead: "Everyone’s benefits can be different. We use verified membership information so nothing goes to the wrong person.",
        currentName: "Current member",
        currentBody: "If your membership is active, Per adds 180 days from the verified expiry date. Points follow verified payments.",
        formerName: "Former / expired member",
        formerBody: "If you come back and renew, you can receive +90 days and +150 Points after the renewal is verified.",
        newName: "New friend",
        newBody: "New here? Welcome. After signup and campaign approval, you receive 66 Welcome Points.",
        couponTitle: "Personal coupon · up to 10%",
        couponBody: "The coupon appears after LINE verification and the related checks. Sending a Wish alone does not create benefits.",
        wishLead: "If there is something you want to say to MMD, write it here. No membership, login or benefit check is needed.",
        wishFine: "Wish is open to everyone. Member benefits are checked separately in LINE.",
        memoryLead: "Per kept these pictures because each one belongs to a real moment we shared.",
        kenjiLead: "Want to know what is currently available on your account? Open LINE and check it there.",
        kenjiBody: "Wish and member benefits are separate. Everyone can send a Wish; benefits use verified member data.",
        finalLead: "There is still a lot Per wants to improve. If you stay with us, MMD will keep becoming easier and better to use."
      },
      html: {
        benefitTitle: "What Per<br><em>wants to give back</em>",
        wishTitle: "Something to tell MMD?<br><em>Leave it here.</em>",
        memoryTitle: "Some pictures<br><em>do not need many words.</em>",
        kenjiTitle: "For your benefits,<br><em>check them in LINE.</em>",
        finalTitle: "Thank you for staying.<br><em>Six years — let’s keep going.</em>"
      }
    },
    zh: {
      text: {
        heroLead: "已经六年了。有靠近的时候，也有安静的时候。这一次 Per 只想回来，把大家照顾得更好一点。",
        heroFine: "确认会员身份后，就能查看为你准备的专属权益，别错过。",
        checkMain: "通过 LINE 查询我的权益",
        introLead: "这个页面不只是活动说明。Per 想把过去的故事、正在改进的事，以及想回馈给大家的心意放在这里。",
        boundaryWish: "有话想留给 MMD，直接写下来就好，不需要登录。",
        boundaryBenefits: "优惠券、会员天数和 Points 会根据已核实的会员资料通过 LINE 另外确认。",
        letterTitle: "Per 写给大家的话",
        letterHello: "大家好。",
        benefitLead: "每个人的权益可能不同，我们会根据真实会员状态和已核实资料确认，避免给错人。",
        currentName: "现有会员",
        currentBody: "如果会员仍有效，会从已核实的到期日增加 180 天；Points 只依据已确认的付款资料。",
        formerName: "曾经 / 已过期会员",
        formerBody: "如果回来续费，续费确认后可按条件增加 90 天及 150 Points。",
        newName: "新朋友",
        newBody: "第一次认识 MMD 也欢迎你。完成注册和活动审核后可获得 66 Welcome Points。",
        couponTitle: "个人优惠券 · 最高 10%",
        couponBody: "优惠券会在 LINE 验证及相关条件确认后显示。单独提交 Wish 不会自动产生权益。",
        wishLead: "如果有话想对 MMD 说，直接写下来就好。不需要会员身份、登录，也不用先等权益审核。",
        wishFine: "Wish 对所有人开放，会员权益会在 LINE 里另外确认。",
        memoryLead: "Per 留着这些照片，因为每一张都是真实一起走过的一段时间。",
        kenjiLead: "想看看现在账户里有什么权益？打开 LINE 查询就可以。",
        kenjiBody: "Wish 和会员权益是分开的。任何人都能写 Wish，权益则依据真实会员资料确认。",
        finalLead: "Per 还有很多想继续做好的地方。谢谢你还在，我们会一步一步让 MMD 更简单、更好用。"
      },
      html: {
        benefitTitle: "Per 想<br><em>回赠给你的照顾</em>",
        wishTitle: "有话想对 MMD 说？<br><em>写在这里就好。</em>",
        memoryTitle: "有些照片<br><em>不需要太多说明。</em>",
        kenjiTitle: "会员权益<br><em>打开 LINE 查询即可。</em>",
        finalTitle: "谢谢你还在。<br><em>六年了，我们继续一起走。</em>"
      }
    }
  };

  function language() {
    const value = String(root.getAttribute("lang") || "th").toLowerCase();
    if (value.startsWith("zh")) return "zh";
    if (value.startsWith("en")) return "en";
    return "th";
  }

  function applyVoice() {
    const pack = copy[language()] || copy.th;
    Object.entries(pack.text || {}).forEach(([key, value]) => {
      root.querySelectorAll(`[data-copy="${key}"]`).forEach((node) => { node.textContent = value; });
    });
    Object.entries(pack.html || {}).forEach(([key, value]) => {
      root.querySelectorAll(`[data-copy-html="${key}"]`).forEach((node) => { node.innerHTML = value; });
    });
  }

  function fixMemberLinks() {
    root.dataset.memberUrl = MEMBER_URL;
    root.querySelectorAll("[data-member-link]").forEach((link) => {
      link.href = MEMBER_URL;
      link.rel = "noopener";
    });
  }

  function buildLayout() {
    root.querySelector(".mx-hero [data-wish-link]")?.remove();

    const track = root.querySelector(".mx-benefit-track");
    const coupon = root.querySelector(".mx-coupon");
    if (track && coupon && coupon.parentNode !== track) {
      coupon.classList.add("mx-benefit-card--coupon");
      track.appendChild(coupon);
    }

    const wish = root.querySelector(".mx-wish");
    const finalSection = root.querySelector(".mx-final");
    if (wish && finalSection?.parentNode) finalSection.parentNode.insertBefore(wish, finalSection);

    if (finalSection) {
      const wrap = finalSection.querySelector(".mx-wrap");
      if (wrap && !wrap.querySelector(".mx-final__hype")) {
        const copyWrap = document.createElement("div");
        copyWrap.className = "mx-final__copy";
        while (wrap.firstChild) copyWrap.appendChild(wrap.firstChild);

        const figure = document.createElement("figure");
        figure.className = "mx-final__hype";
        const img = document.createElement("img");
        img.src = HYPE_URL;
        img.alt = "HYPE · MMD Privé";
        img.loading = "lazy";
        img.decoding = "async";
        figure.appendChild(img);
        wrap.append(copyWrap, figure);
      }
    }
  }

  // Repair the destination again in the capture phase so older page scripts cannot
  // restore the obsolete Mini App URL before navigation.
  root.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-member-link]");
    if (target && root.contains(target)) target.href = MEMBER_URL;
  }, true);

  root.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      window.setTimeout(() => { applyVoice(); fixMemberLinks(); }, 0);
    });
  });

  if ("MutationObserver" in window) {
    new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "lang")) window.setTimeout(applyVoice, 0);
    }).observe(root, { attributes: true, attributeFilter: ["lang"] });
  }

  buildLayout();
  fixMemberLinks();
  applyVoice();
  window.setTimeout(() => { fixMemberLinks(); applyVoice(); }, 120);
})();
