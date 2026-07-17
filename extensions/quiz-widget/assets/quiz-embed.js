(function () {
  var PROXY_BASE = "/apps/findly";
  var LAST_SHOWN_KEY = "findly-quiz-popup-last-shown";
  var floatingButton = null;

  function insertAutoPosition(container) {
    var main = document.querySelector("main, #MainContent, .main-content, [role='main']");
    if (main) {
      main.insertBefore(container, main.firstChild);
      return;
    }
    // No recognizable <main> in this theme - fall back to the very top of
    // <body> rather than not showing the quiz at all.
    document.body.insertBefore(container, document.body.firstChild);
  }

  function shouldAutoShowPopup(placement) {
    if (placement.popupAlwaysOnHomepage) {
      return window.location.pathname === "/";
    }
    var minutes =
      typeof placement.popupFrequencyMinutes === "number" ? placement.popupFrequencyMinutes : 1440;
    if (minutes <= 0) return true;
    var lastShown = Number(localStorage.getItem(LAST_SHOWN_KEY) || 0);
    return (Date.now() - lastShown) / 60000 >= minutes;
  }

  function showFloatingButton(quiz, placement) {
    if (floatingButton) return;
    floatingButton = document.createElement("button");
    floatingButton.type = "button";
    var position = placement.popupButtonPosition || "left";
    floatingButton.className =
      "findly-quiz__floating-button findly-quiz__floating-button--" + position;
    floatingButton.textContent = (quiz.text && quiz.text.floatingButton) || "Take the quiz";
    // Set directly on the button rather than relying on inherited page-level
    // variables - it lives outside any quiz's container, and with two
    // quizzes active at once (e.g. auto + popup) inheritance would pick up
    // whichever quiz happened to render last, not necessarily this one.
    if (placement.popupButtonBackgroundColor) {
      floatingButton.style.background = placement.popupButtonBackgroundColor;
    } else if (quiz.design && quiz.design.accentColor) {
      floatingButton.style.background = quiz.design.accentColor;
    }
    if (placement.popupButtonTextColor) {
      floatingButton.style.color = placement.popupButtonTextColor;
    }
    floatingButton.addEventListener("click", function () {
      openPopup(quiz, placement);
    });
    document.body.appendChild(floatingButton);
  }

  function closePopup(backdrop, quiz, placement) {
    backdrop.remove();
    showFloatingButton(quiz, placement);
  }

  function openPopup(quiz, placement) {
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }

    // cardWrap sizes itself to the same max-width as the card so the close
    // button (absolutely positioned inside cardWrap) lands on the card's
    // own corner instead of floating disconnected somewhere on the page.
    var cardWrap = document.createElement("div");
    cardWrap.className = "findly-quiz__popup-card-wrap";
    if (quiz.design && quiz.design.maxWidth) {
      cardWrap.style.maxWidth = quiz.design.maxWidth;
    }

    var container = document.createElement("div");
    container.className = "findly-quiz";
    cardWrap.appendChild(container);

    var backdrop = document.createElement("div");
    backdrop.className = "findly-quiz__popup-backdrop";
    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) closePopup(backdrop, quiz, placement);
    });

    if (placement.popupShowCloseButton !== false) {
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "findly-quiz__popup-close";
      closeBtn.innerHTML = "&times;";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.addEventListener("click", function () {
        closePopup(backdrop, quiz, placement);
      });
      cardWrap.appendChild(closeBtn);
    }

    backdrop.appendChild(cardWrap);
    document.body.appendChild(backdrop);

    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    window.FindlyQuiz.mount(container, quiz, PROXY_BASE);
  }

  // Used for auto/collection placement when inlineShowMode is "button" -
  // shows a trigger button where the quiz would otherwise render
  // immediately, and only mounts the actual quiz once clicked.
  function showInlineTriggerButton(container, quiz) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "findly-quiz__trigger-button";
    btn.textContent = (quiz.text && quiz.text.floatingButton) || "Take the quiz";
    if (quiz.design && quiz.design.accentColor) {
      btn.style.setProperty("--findly-accent", quiz.design.accentColor);
    }
    btn.addEventListener("click", function () {
      window.FindlyQuiz.mount(container, quiz, PROXY_BASE);
    });
    container.appendChild(btn);
  }

  document.addEventListener("DOMContentLoaded", function () {
    window.FindlyQuiz.fetchQuizzes(PROXY_BASE)
      .then(function (quizzes) {
        // Auto and popup are independent - both can be live on the same
        // page at once (e.g. one quiz on-page, a different one as a popup).
        var auto = quizzes.auto;
        if (auto && auto.questions.length) {
          var container = document.createElement("div");
          container.className = "findly-quiz";
          insertAutoPosition(container);
          var inlineShowMode = (auto.placement && auto.placement.inlineShowMode) || "immediate";
          if (inlineShowMode === "button") {
            showInlineTriggerButton(container, auto);
          } else {
            window.FindlyQuiz.mount(container, auto, PROXY_BASE);
          }
        }

        var popup = quizzes.popup;
        if (popup && popup.questions.length) {
          var placement = popup.placement;
          // The floating button is always available as a way into the quiz
          // - opening the popup removes it, closing brings it back. Without
          // this, a visitor inside the frequency cooldown window had no way
          // to reach the quiz at all.
          showFloatingButton(popup, placement);
          if (shouldAutoShowPopup(placement)) {
            setTimeout(function () {
              openPopup(popup, placement);
            }, (placement.popupDelaySeconds || 0) * 1000);
          }
        }
      })
      .catch(function () {});
  });
})();
