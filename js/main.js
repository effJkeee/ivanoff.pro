/* ivanoff.pro — поведение страницы. Без библиотек. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js"); // включает появление при прокрутке; без скрипта всё видно сразу

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var desktop = matchMedia("(min-width: 900px)");
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var EASE = "cubic-bezier(.16,1,.3,1)";

  /* Сцена играет, только пока она в кадре и вкладка открыта. */
  function whenVisible(el, threshold, onShow, onHide) {
    var inView = false, on = false;
    function sync() {
      var want = inView && !document.hidden;
      if (want === on) return;
      on = want;
      (on ? onShow : onHide)();
    }
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      sync();
    }, { threshold: threshold }).observe(el);
    document.addEventListener("visibilitychange", sync);
    return function () { return on; };
  }

  /* ===== Кнопки «Разобрать мою задачу» открывают окно с формой =====
     Форма внизу страницы остаётся как была: в ней поле стоит прямо на странице.
     Если браузер не умеет <dialog>, кнопки по-старому ведут к форме внизу. */
  var form = $("#form"), modal = $("#modal");
  function closeModal() {
    if (!modal.open || modal.classList.contains("closing")) return;
    if (reduce) { modal.close(); return; }
    modal.classList.add("closing");
    setTimeout(function () { modal.classList.toggle("closing", false); modal.close(); }, 200);
  }
  function openModal() {
    if (!modal || !modal.showModal) {
      form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      setTimeout(function () { $("#tg").focus({ preventScroll: true }); }, reduce ? 0 : 450);
      return;
    }
    if (modal.open) return;
    modal.classList.toggle("closing", false);
    modal.showModal();
    root.classList.add("modal-open");
    var input = $('input[name="telegram"]', modal);
    if (input && !$("form", modal).hidden) input.focus();
  }
  $$('a[href="#form"]').forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
  });
  if (modal && modal.showModal) {
    $(".modal-x", modal).addEventListener("click", closeModal);
    modal.addEventListener("cancel", function (e) { e.preventDefault(); closeModal(); }); // Esc — с плавным закрытием
    modal.addEventListener("close", function () { root.classList.toggle("modal-open", false); });
    modal.addEventListener("click", function (e) { // клик мимо окна, по затемнению
      var r = modal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal();
    });
  }

  /* ===== Прокрутка: шапка-таблетка на десктопе и липкая кнопка на телефоне =====
     Липкая кнопка видна, только когда в кадре нет другой кнопки и формы. */
  var sticky = $(".sticky"), heroBtn = $(".hero .btn"), navbar = $(".navbar");
  var inlineBtns = $$(".btn").filter(function (b) { return !sticky.contains(b) && !b.closest(".nav"); });
  var ticking = false;
  function onScroll() {
    ticking = false;
    var vh = innerHeight;
    var pastHero = heroBtn.getBoundingClientRect().bottom < 0;
    var formInView = form.getBoundingClientRect().top < vh;
    var btnInView = inlineBtns.some(function (b) {
      var r = b.getBoundingClientRect();
      return r.top < vh && r.bottom > 0;
    });
    sticky.classList.toggle("on", pastHero && !formInView && !btnInView);
    navbar.classList.toggle("float", scrollY > 48);
  }
  addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ===== «Что могу забрать»: на десктопе описания открыты, на телефоне свёрнуты ===== */
  function syncServices() {
    $$("details.sv").forEach(function (d) {
      d.open = desktop.matches;
      d.classList.toggle("is-open", d.open);
    });
  }
  syncServices();
  desktop.addEventListener("change", syncServices);

  /* ===== Маленькие картинки (блоки 4 и 7) и сцена «два пути» (блок 8) играют, пока они в кадре;
     на десктопе картинка в карточке запускается заново при наведении ===== */
  (function () {
    var cards = $$(".sv, .g").filter(function (c) { return $(".mini", c); }).concat($$(".route-scene"));
    if (reduce || !cards.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle("play", e.isIntersecting); });
    }, { threshold: 0.4 });
    cards.forEach(function (c) {
      io.observe(c);
      c.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse" || !c.classList.contains("play")) return;
        c.classList.toggle("play", false);
        void c.offsetWidth;
        c.classList.add("play");
      });
    });
  })();

  /* ===== Заявка: форма в окне и форма внизу страницы =====
     Одно поле — Telegram. Заявки уходят через FormSubmit (formsubmit.co), как на прежнем сайте:
     без своего сервера. Проверка и тексты ошибок тоже взяты оттуда.
     Форм две, логика одна: каждая лежит в своей карточке .fcard. Когда заявка ушла из любой,
     «Готово» показывают обе — чтобы человек не отправил её второй раз. */
  (function () {
    var ENDPOINT = "https://formsubmit.co/ajax/effjkeee@gmail.com";
    var cards = $$(".fcard").filter(function (c) { return $("form", c); });

    function isValidTelegram(value) {
      var v = value.trim();
      // @username / username (5–32 символа), ссылка t.me/username или номер телефона
      return /^@?[a-zA-Z0-9_]{5,32}$/.test(v) ||
             /^(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{5,32}\/?$/.test(v) ||
             /^\+?[\d\s()-]{7,20}$/.test(v);
    }
    function allDone(from) {
      cards.forEach(function (card) {
        $("form", card).hidden = true;
        $(".okstate", card).hidden = false;
        if (card === from) card.classList.add("sent"); // самолётик и прорисовка галочки — там, где нажали
      });
    }

    cards.forEach(function (card) {
      var lead = $("form", card), err = $(".ferr", card), box = $(".fbox", card);
      var input = $('input[name="telegram"]', card), honey = $('input[name="_honey"]', card);
      var btn = $('button[type="submit"]', card), label = $(".btn-t", btn), text = label.textContent;

      function fail(message) {
        err.textContent = message;
        box.classList.toggle("bad", false);
        void box.offsetWidth; // чтобы поле вздрогнуло и при повторной ошибке
        box.classList.add("bad");
      }
      function busy(on) {
        btn.disabled = on;
        btn.classList.toggle("busy", on);
        label.textContent = on ? "Отправляю…" : text;
      }

      input.addEventListener("input", function () {
        err.textContent = "";
        box.classList.toggle("bad", false);
      });

      lead.addEventListener("submit", function (e) {
        e.preventDefault();
        if (btn.disabled) return;
        var value = input.value.trim();
        if (!isValidTelegram(value)) { fail("Укажите ник в Telegram или номер"); input.focus(); return; }
        if (honey.value) { allDone(card); return; } // бот заполнил скрытое поле — делаем вид, что всё ок

        busy(true);
        // сервис может не ответить вовсе: через 20 секунд обрываем запрос и показываем ошибку, а не держим кнопку
        var ctl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
        fetch(ENDPOINT, {
          signal: ctl ? ctl.signal : undefined,
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            "Telegram": value,
            "_subject": "Новая заявка с сайта ivanoff.pro",
            "_template": "table",
            "_captcha": "false"
          })
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            clearTimeout(timer);
            if (data.success === true || data.success === "true") allDone(card);
            else throw new Error(data.message || "send failed");
          })
          .catch(function () {
            clearTimeout(timer);
            busy(false);
            fail("Не получилось отправить. Попробуйте ещё раз через минуту.");
          });
      });
    });
  })();

  /* ===== Блок 5: шаги загораются по прокрутке, документ «План» заполняется вместе с ними =====
     «Черта» стоит на 60% высоты экрана: шаг, чей номер поднялся выше неё, считается пройденным.
     Синий отрезок линии между шагами растёт на долю пути черты от номера до номера. */
  (function () {
    var list = $("#steps"), scene = $("#plan");
    if (!list) return;
    var items = $$(".st", list), nums = items.map(function (it) { return $(".num", it); });
    var queued = false;
    function update() {
      queued = false;
      var box = list.getBoundingClientRect(), vh = innerHeight;
      if (box.bottom < -vh || box.top > vh * 2) return; // блок далеко — не считаем
      var line = vh * 0.6, reached = 0;
      var centers = nums.map(function (n) { var r = n.getBoundingClientRect(); return r.top + r.height / 2; });
      items.forEach(function (it, i) {
        var on = centers[i] <= line;
        if (on) reached = i + 1;
        it.classList.toggle("on", on);
        if (i < items.length - 1) {
          var sp = (line - centers[i]) / (centers[i + 1] - centers[i]);
          it.style.setProperty("--sp", Math.max(0, Math.min(1, sp)).toFixed(3));
        }
      });
      if (scene) for (var k = 1; k <= items.length; k++) scene.classList.toggle("r" + k, reached >= k);
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    update();
  })();

  /* ===== Блок 6: ползунок «часов в неделю на рутину» → часы и рабочие дни за год =====
     Арифметика простая: часы × 52 недели, дни = часы за год / 8. Денег не считаем.
     Когда карточка впервые попадает в кадр, ползунок сам проезжает от 1 до значения по умолчанию —
     так видно, что его можно двигать. Если человек тронул его раньше, показ не запускается. */
  (function () {
    var inp = $("#hrs");
    if (!inp) return;
    var hOut = $("#hrsOut"), hUnit = $("#hrsUnit"), yOut = $("#yrOut"), yUnit = $("#yrUnit"), dOut = $("#dayOut");
    var min = +inp.min, max = +inp.max, start = +inp.value;
    var shown = start * 52, tween = 0, touched = false;

    function plural(n, forms) { // 1 час, 2 часа, 5 часов
      var a = n % 10, b = n % 100;
      if (a === 1 && b !== 11) return forms[0];
      if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return forms[1];
      return forms[2];
    }
    function render(v, instant) {
      var year = v * 52, days = Math.round(year / 8);
      inp.style.setProperty("--f", "calc(14px + (100% - 28px) * " + ((v - min) / (max - min)).toFixed(4) + ")");
      hOut.textContent = v;
      hUnit.textContent = plural(v, ["час", "часа", "часов"]) + " в неделю";
      yUnit.textContent = plural(year, ["час", "часа", "часов"]) + " в год";
      dOut.textContent = "это " + days + " " + plural(days, ["рабочий день", "рабочих дня", "рабочих дней"]);
      cancelAnimationFrame(tween);
      if (instant || reduce) { shown = year; yOut.textContent = year; return; }
      var from = shown, t0 = performance.now();
      (function frame(now) {
        var p = Math.min(1, (now - t0) / 320);
        shown = Math.round(from + (year - from) * (1 - Math.pow(1 - p, 3)));
        yOut.textContent = shown;
        if (p < 1) tween = requestAnimationFrame(frame);
      })(t0);
    }
    inp.addEventListener("input", function () { touched = true; render(+inp.value); });
    inp.addEventListener("pointerdown", function () { touched = true; });
    render(start, true);

    if (reduce || !("IntersectionObserver" in window)) return;
    inp.value = min; render(min, true); // до показа стоит на единице, чтобы не прыгать на глазах
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      if (touched) return;
      var t0 = performance.now(), last = 0;
      setTimeout(function () {
        t0 = performance.now();
        (function frame(now) {
          if (touched) return;
          var p = Math.min(1, (now - t0) / 1200);
          var v = Math.round(min + (start - min) * (1 - Math.pow(1 - p, 3)));
          if (v !== last) { last = v; inp.value = v; render(v, true); }
          if (p < 1) requestAnimationFrame(frame);
        })(t0);
      }, 500);
    }, { threshold: 0.6 });
    io.observe(inp);
  })();

  /* ===== Заголовки с data-split режутся на слова, чтобы выезжать как на первом экране ===== */
  $$("[data-split]").forEach(function (h) {
    var words = h.textContent.trim().split(" ");
    h.setAttribute("aria-label", h.textContent.trim());
    var box = document.createElement("span");
    box.setAttribute("aria-hidden", "true");
    words.forEach(function (word, i) {
      var w = document.createElement("span"), inner = document.createElement("span");
      w.className = "w";
      w.style.setProperty("--i", i);
      inner.textContent = word;
      w.appendChild(inner);
      box.appendChild(w);
      if (i < words.length - 1) box.appendChild(document.createTextNode(" "));
    });
    h.textContent = "";
    h.appendChild(box);
  });

  /* ===== Появление при прокрутке: data-rv и data-split получают класс .in ===== */
  (function () {
    var els = $$("[data-rv], [data-split]");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ===== Точки холста в сценах темнеют под курсором ===== */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$(".scene").forEach(function (scene) {
      scene.addEventListener("pointermove", function (e) {
        var r = scene.getBoundingClientRect();
        scene.style.setProperty("--mx", (e.clientX - r.left) + "px");
        scene.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ===== Цифры досчитываются от нуля: «+30%» → «+0%» … «+30%» =====
     На первом экране — сразу, цифры кейса (data-count) — когда доехали до них. */
  function countUp(el, delay) {
    var m = el.textContent.trim().match(/^(\D*)(\d+)(.*)$/);
    if (!m || reduce) return;
    var to = +m[2], dur = 1200;
    el.style.minWidth = el.getBoundingClientRect().width + "px"; // текст рядом не прыгает
    el.textContent = m[1] + "0" + m[3];
    setTimeout(function () {
      var t0 = performance.now();
      (function frame(now) {
        var p = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 4);
        el.textContent = m[1] + Math.round(to * eased) + m[3];
        if (p < 1) requestAnimationFrame(frame);
      })(t0);
    }, delay);
  }
  if ($(".proof .pill")) countUp($(".proof .pill"), 900);
  (function () {
    var els = $$("b[data-count]");
    if (reduce || !els.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var d = parseInt(getComputedStyle(e.target.parentNode).getPropertyValue("--d"), 10) || 0;
        countUp(e.target, d + 150);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ===== Раскрывашки открываются и закрываются плавно ===== */
  $$("details.acc, .faq details, details.sv").forEach(function (d) {
    var s = $("summary", d), isService = d.classList.contains("sv");
    if (!s) return;
    if (reduce || !d.animate) {
      // без анимации: услуги на десктопе всё равно не сворачиваются
      if (isService) s.addEventListener("click", function (e) { if (desktop.matches) e.preventDefault(); });
      return;
    }
    var anim = null;
    d.classList.add("acc-js");
    d.classList.toggle("is-open", d.open);
    s.addEventListener("click", function (e) {
      e.preventDefault();
      if (isService && desktop.matches) return; // на десктопе описания услуг всегда открыты
      var opening = !d.classList.contains("is-open");
      var from = d.offsetHeight;
      if (anim) anim.cancel();
      d.classList.toggle("is-open", opening);
      if (opening) d.open = true;
      var to = opening ? d.offsetHeight : s.offsetHeight + (d.offsetHeight - d.clientHeight);
      d.style.overflow = "hidden";
      anim = d.animate({ height: [from + "px", to + "px"] }, { duration: opening ? 480 : 360, easing: EASE });
      anim.onfinish = function () {
        if (!opening) d.open = false;
        d.style.overflow = "";
        anim = null;
      };
    });
  });

  /* ===== Первый экран: сцена «рутина делается сама» =====
     Три акта по пунктам списка: заявка уходит в CRM, бот отвечает клиенту, собирается сводка.
     Пока идёт акт, у пункта заполняется круг; акт закончился — пункт зачёркнут.
     После третьего карточка списка уходит, из стопки выезжает следующая, и всё сначала.
     Само движение внутри актов — CSS (класс .play), здесь только порядок. */
  (function () {
    var scene = $(".hero .scene"), card = $("#routine");
    if (!scene || !card) return;
    var items = $$(".it", card), acts = $$(".act", scene);
    var g1 = $(".stack .g1"), g2 = $(".stack .g2");
    if (reduce || !card.animate) return; // остаётся статичная сцена из разметки

    var DUR = [3500, 3900, 3800]; // длительность актов, мс
    var SHADOW_ON = "0 1px 2px rgba(23,23,23,.04), 0 12px 32px rgba(23,23,23,.08)";
    var SHADOW_OFF = "0 1px 2px rgba(23,23,23,0), 0 12px 32px rgba(23,23,23,0)";
    var gen = 0; // номер запуска: уход с экрана или клик по пункту обрывает текущий цикл

    function reset(doneBefore) {
      card.classList.add("no-anim");
      items.forEach(function (it, i) {
        it.classList.toggle("run", false);
        it.classList.toggle("done", i < (doneBefore || 0));
      });
      acts.forEach(function (a) {
        a.classList.toggle("on", false);
        a.classList.toggle("play", false);
      });
      void card.offsetWidth;
      card.classList.toggle("no-anim", false);
    }

    function swap() {
      var t1 = getComputedStyle(g1).transform, t2 = getComputedStyle(g2).transform;
      var out = card.animate(
        [{ transform: "none", opacity: 1 }, { transform: "translateY(-22px) scale(.985)", opacity: 0 }],
        { duration: 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      var up1 = g1.animate(
        [{ transform: t1, boxShadow: SHADOW_OFF }, { transform: "none", boxShadow: SHADOW_ON }],
        { duration: 620, easing: EASE, fill: "forwards" });
      var up2 = g2.animate([{ transform: t2 }, { transform: t1 }], { duration: 620, easing: EASE, fill: "forwards" });
      return Promise.all([out.finished, up1.finished, up2.finished]).then(function () {
        reset();
        [out, up1, up2].forEach(function (a) { a.cancel(); });
        g2.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
        g1.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
        items.forEach(function (it, i) {
          it.animate(
            [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
            { duration: 480, delay: i * 80, easing: EASE, fill: "backwards" });
        });
      });
    }

    function run(delay, from) {
      var g = ++gen;
      var alive = function () { return g === gen; };
      (async function () {
        reset(from);
        await sleep(delay);
        var i = from || 0;
        while (alive()) {
          for (; i < acts.length; i++) {
            var act = acts[i], it = items[i], last = i === acts.length - 1;
            act.classList.add("on", "play");
            it.style.setProperty("--dur", DUR[i] + "ms");
            it.classList.add("run");
            await sleep(DUR[i]); if (!alive()) return;
            it.classList.add("done");
            await sleep(last ? 1900 : 700); if (!alive()) return;
            act.classList.toggle("on", false);
            if (last) await swap(); else await sleep(380);
            if (!alive()) return;
            act.classList.toggle("play", false);
          }
          i = 0;
          await sleep(300);
        }
      })();
    }

    var first = true;
    var isOn = whenVisible(scene, 0.25,
      function () { run(first ? 1000 : 300, 0); first = false; },
      function () { gen++; });

    /* клик по пункту — показать его акт */
    items.forEach(function (it, i) {
      it.addEventListener("click", function () { if (isOn()) run(0, i); });
    });
  })();

  /* ===== Блок 2: сцена «нейросеть кликает в таблице» =====
     Четыре акта по списку поломок:
       1. медленно — курсор нейросети ползёт к ячейке, стрелки часов крутятся;
       2. снесло данные — удаляет строку, потом выделяет всё и стирает;
       3. только пока включён компьютер — экран гаснет, курсор замирает на полпути;
       4. вёл сам — руководитель дописывает строку руками.
     У пункта списка заполняется круг, в конце акта появляется крест. В финале «срабатывает» вывод. */
  (function () {
    var scene = $("#why-scene"), list = $("#fails");
    if (!scene || !list) return;
    var board = $(".b2", scene), sheet = $(".sheet", scene), head = $(".sh-head", scene);
    var rows = $$(".sh-body .sh-row", scene), lastRow = rows[rows.length - 1];
    var ai = $(".cur.ai", scene), me = $(".cur.me", scene);
    var fails = $$(".fail", list), callout = $(".callout");
    if (reduce || !board.animate) return; // остаётся целая таблица и список с крестами

    var lastCells = $$("span", lastRow);
    var lastText = lastCells.map(function (c) { return c.textContent; });
    var DUR = [3900, 4400, 3600, 4000];
    var gen = 0, anims = [];
    var STOP = {}; // так прерывается акт, когда запуск устарел

    function track(a) { anims.push(a); return a; }
    function cell(row, n) { return row.children[n]; }

    /* --- курсоры --- */
    function place(cur, p) { cur._p = p; cur.style.transform = "translate(" + p[0] + "px," + p[1] + "px)"; }
    function point(el, fx, fy) {
      var b = board.getBoundingClientRect(), r = el.getBoundingClientRect();
      return [r.left - b.left + r.width * fx, r.top - b.top + r.height * fy];
    }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function move(cur, p, dur, easing) {
      var a = track(cur.animate(
        [{ transform: "translate(" + cur._p[0] + "px," + cur._p[1] + "px)" }, { transform: "translate(" + p[0] + "px," + p[1] + "px)" }],
        { duration: dur, easing: easing || "cubic-bezier(.45,0,.2,1)", fill: "forwards" }));
      cur._move = a;
      return a.finished.then(function () { place(cur, p); a.cancel(); });
    }
    function freeze(cur) { // остановить на полпути и запомнить место
      var m = new DOMMatrixReadOnly(getComputedStyle(cur).transform);
      if (cur._move) cur._move.cancel();
      place(cur, [m.m41, m.m42]);
    }
    function click(cur) {
      return track(cur.firstElementChild.animate(
        [{ transform: "none" }, { transform: "scale(.78)" }, { transform: "none" }],
        { duration: 260, easing: "ease-out" })).finished;
    }

    /* --- исходное состояние: целая таблица, курсоров нет --- */
    function reset(doneBefore) {
      anims.forEach(function (a) { a.cancel(); });
      anims = [];
      board.classList.toggle("slow", false);
      sheet.classList.toggle("off", false);
      [ai, me].forEach(function (c) { c.classList.toggle("show", false); c.classList.toggle("idle", false); });
      rows.forEach(function (r) {
        r.classList.toggle("sel", false);
        $$("span", r).forEach(function (c) { c.classList.toggle("cell-on", false); c.classList.toggle("typing", false); });
      });
      lastCells.forEach(function (c, i) { c.textContent = lastText[i]; });
      list.classList.add("no-anim");
      fails.forEach(function (f, i) {
        f.classList.toggle("run", false);
        f.classList.toggle("done", i < (doneBefore || 0));
      });
      void list.offsetWidth;
      list.classList.toggle("no-anim", false);
    }

    function run(delay, from) {
      var g = ++gen;
      async function step(ms) { await sleep(ms); if (g !== gen) throw STOP; }
      async function go(promise) { await promise; if (g !== gen) throw STOP; }

      var ACTS = [
        /* 1. работало медленно */
        async function () {
          var target = point(cell(rows[0], 1), 0.3, 0.55);
          place(ai, point(sheet, 0.66, 0.84));
          ai.classList.add("show");
          board.classList.add("slow");
          await step(350);
          var start = ai._p;
          await go(move(ai, lerp(start, target, 0.3), 900, "linear"));
          await step(380);
          await go(move(ai, lerp(start, target, 0.62), 950, "linear"));
          await step(320);
          await go(move(ai, target, 800, "linear"));
          await go(click(ai));
          cell(rows[0], 1).classList.add("cell-on");
          await step(250);
          board.classList.toggle("slow", false);
        },
        /* 2. удаляло лишнее, а однажды снесло все данные */
        async function () {
          if (!ai._p) place(ai, point(cell(rows[0], 1), 0.3, 0.55));
          ai.classList.add("show");
          cell(rows[0], 1).classList.toggle("cell-on", false);
          await go(move(ai, point(rows[1], 0.34, 0.55), 600));
          await go(click(ai));
          rows[1].classList.add("sel");
          await step(450);
          var h = rows[1].getBoundingClientRect().height;
          await go(track(rows[1].animate(
            [{ height: h + "px", opacity: 1, borderTopWidth: "1px" }, { height: "0px", opacity: 0, borderTopWidth: "0px" }],
            { duration: 420, easing: EASE, fill: "forwards" })).finished);
          await step(250);
          await go(move(ai, point(head, 0.07, 0.6), 550));
          await go(click(ai));
          rows.forEach(function (r) { r.classList.add("sel"); });
          await step(520);
          rows.forEach(function (r, i) {
            if (i === 1) return;
            track(r.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(1.4em)" }],
              { duration: 300, delay: i * 55, easing: "ease-in", fill: "forwards" }));
          });
          track(sheet.animate(
            [{ transform: "none" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-3px)" }, { transform: "none" }],
            { duration: 380, delay: 300 }));
          await step(1100);
        },
        /* 3. работало, только пока включён его компьютер */
        async function () {
          anims.forEach(function (a) { a.cancel(); });
          anims = [];
          rows.forEach(function (r) { r.classList.toggle("sel", false); });
          lastCells.forEach(function (c) { c.textContent = ""; }); // последнюю строку нейросеть не успеет
          rows.forEach(function (r, i) {
            track(r.animate([{ opacity: 0, transform: "translateY(.5em)" }, { opacity: 1, transform: "none" }],
              { duration: 420, delay: i * 60, easing: EASE, fill: "backwards" }));
          });
          if (!ai._p) place(ai, point(head, 0.07, 0.6));
          ai.classList.add("show");
          await step(450);
          move(ai, point(lastCells[0], 0.3, 0.55), 2600, "linear").catch(function () {});
          await step(1250);
          sheet.classList.add("off");
          freeze(ai);
          ai.classList.add("idle");
          await step(1900);
        },
        /* 4. таблицу он всё равно вёл сам */
        async function () {
          sheet.classList.toggle("off", false);
          ai.classList.toggle("show", false);
          ai.classList.toggle("idle", false);
          lastCells.forEach(function (c) { c.textContent = ""; });
          await step(450);
          place(me, point(sheet, 0.6, 0.5));
          me.classList.add("show");
          for (var n = 0; n < lastCells.length; n++) {
            var c = lastCells[n];
            await go(move(me, point(c, 0.62, 0.82), n ? 320 : 600));
            if (!n) await go(click(me));
            c.classList.add("typing");
            for (var k = 1; k <= lastText[n].length; k++) {
              c.textContent = lastText[n].slice(0, k);
              await step(58);
            }
            await step(140);
            c.classList.toggle("typing", false);
          }
          await step(300);
        }
      ];

      (async function () {
        reset(from);
        ai._p = me._p = null;
        await step(delay);
        var i = from || 0;
        for (;;) {
          for (; i < ACTS.length; i++) {
            var f = fails[i];
            f.style.setProperty("--dur", DUR[i] + "ms");
            f.classList.add("run");
            await ACTS[i]();
            f.classList.add("done");
            await step(500);
          }
          /* финал: руководитель уходит, вывод «срабатывает» */
          me.classList.toggle("show", false);
          await step(500);
          callout.classList.toggle("hit", false);
          void callout.offsetWidth;
          callout.classList.add("hit");
          await step(3200);
          reset(0);
          ai._p = me._p = null;
          i = 0;
          await step(600);
        }
      })().catch(function (e) { if (e !== STOP && !(e && e.name === "AbortError")) throw e; });
    }

    var first = true;
    var isOn = whenVisible(scene, 0.35,
      function () { run(first ? 700 : 300, 0); first = false; },
      function () { gen++; });

    /* клик по пункту — показать его акт */
    fails.forEach(function (f, i) {
      f.addEventListener("click", function () { if (isOn()) run(0, i); });
    });
  })();

  /* ===== Блок 3: сцена «отмена занятия идёт по цепочке» =====
     Четыре экрана: учитель жмёт «Отменить занятие» → руководителю приходит запрос, он жмёт
     «Подтвердить» → CRM синхронизируется → на сайте занятие зачёркнуто.
     Классы экрана: .on — дошли до него, .focus — он сейчас главный (на телефоне виден только он),
     .tap — нажатие, .hit — состояние изменилось. Всё движение — CSS, здесь только порядок. */
  (function () {
    var scene = $("#flow"), list = $("#chain");
    if (!scene || !list) return;
    var stages = $$(".stage", scene), wires = $$(".wire3", scene), steps = $$(".it", list);
    if (reduce) return; // остаётся конечный кадр: всё подтверждено и обновлено

    /* до нажатия или смены состояния, нажатие есть или нет, сколько держим после */
    var PLAN = [
      { before: 1000, tap: true, after: 900 },
      { before: 1600, tap: true, after: 1000 },
      { before: 1300, tap: false, after: 800 },
      { before: 1100, tap: false, after: 900 }
    ];
    var TAP = 380, WIRE = 520;
    var gen = 0, STOP = {};

    function reset(doneBefore) {
      var n = doneBefore || 0;
      list.classList.add("no-anim");
      stages.forEach(function (st, i) {
        st.classList.toggle("on", i < n);
        st.classList.toggle("hit", i < n);
        st.classList.toggle("tap", false);
        st.classList.toggle("focus", false);
      });
      wires.forEach(function (w, i) { w.classList.toggle("go", i < n); });
      steps.forEach(function (s, i) {
        s.classList.toggle("run", false);
        s.classList.toggle("done", i < n);
      });
      void list.offsetWidth;
      list.classList.toggle("no-anim", false);
    }

    function run(delay, from) {
      var g = ++gen;
      async function step(ms) { await sleep(ms); if (g !== gen) throw STOP; }
      (async function () {
        reset(from);
        var i = from || 0;
        stages[i].classList.add("focus");
        await step(delay);
        for (;;) {
          for (; i < stages.length; i++) {
            var st = stages[i], p = PLAN[i];
            stages.forEach(function (x) { x.classList.toggle("focus", x === st); });
            st.classList.add("on");
            steps[i].style.setProperty("--dur", (p.before + (p.tap ? TAP : 0) + p.after) + "ms");
            steps[i].classList.add("run");
            await step(p.before);
            if (p.tap) { st.classList.add("tap"); await step(TAP); }
            st.classList.add("hit");
            await step(p.after);
            steps[i].classList.add("done");
            if (wires[i]) { wires[i].classList.add("go"); await step(WIRE); }
          }
          await step(2800);
          reset(0);
          i = 0;
          stages[0].classList.add("focus");
          await step(700);
        }
      })().catch(function (e) { if (e !== STOP) throw e; });
    }

    var first = true;
    var isOn = whenVisible(scene, 0.3,
      function () { run(first ? 600 : 300, 0); first = false; },
      function () { gen++; });

    /* клик по шагу цепочки — показать с него */
    steps.forEach(function (s, i) {
      s.addEventListener("click", function () { if (isOn()) run(200, i); });
    });
  })();
})();
