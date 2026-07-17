(function () {
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-findly-quiz]").forEach(function (container) {
      var proxyBase = container.getAttribute("data-proxy-base") || "/apps/findly";
      container.innerHTML = '<div class="findly-quiz__loading">Loading…</div>';

      window.FindlyQuiz.fetchQuizzes(proxyBase)
        .then(function (quizzes) {
          var quiz = quizzes.custom;
          if (!quiz || !quiz.questions.length) {
            container.innerHTML = "";
            return;
          }
          window.FindlyQuiz.mount(container, quiz, proxyBase);
        })
        .catch(function () {
          container.innerHTML = "";
        });
    });
  });
})();
