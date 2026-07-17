(function () {
  var FONT_STACKS = {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  };

  function fetchQuizzes(proxyBase, path) {
    proxyBase = proxyBase || "/apps/findly";
    path = path || window.location.pathname;
    return fetch(proxyBase + "/quiz?path=" + encodeURIComponent(path))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        return data.quizzes || { auto: null, popup: null, custom: null };
      });
  }

  // Two independent quizzes can be live on the same page at once (e.g. one
  // auto-placed, one as a popup) - variables are scoped to each quiz's own
  // container only, never to <html>, so one quiz's colors/CSS can never
  // bleed into another's.
  function applyDesign(container, quiz) {
    var design = quiz.design;
    if (!design) return;
    var px = function (n) {
      return typeof n === "number" ? n + "px" : n;
    };
    var style = container.style;
    if (design.accentColor) style.setProperty("--findly-accent", design.accentColor);
    if (design.backgroundColor) style.setProperty("--findly-bg", design.backgroundColor);
    if (design.textColor) style.setProperty("--findly-text", design.textColor);
    if (design.borderColor) style.setProperty("--findly-border-color", design.borderColor);
    if (design.borderWidth !== undefined)
      style.setProperty("--findly-border-width", px(design.borderWidth));
    if (design.borderRadius !== undefined)
      style.setProperty("--findly-border-radius", px(design.borderRadius));
    if (design.maxWidth !== undefined) style.setProperty("--findly-max-width", px(design.maxWidth));
    if (design.fontFamily && FONT_STACKS[design.fontFamily])
      style.setProperty("--findly-font-family", FONT_STACKS[design.fontFamily]);
    if (design.questionFontSize !== undefined)
      style.setProperty("--findly-question-size", px(design.questionFontSize));
    if (design.answerFontSize !== undefined)
      style.setProperty("--findly-answer-size", px(design.answerFontSize));
    if (design.cartNoticeBackgroundColor)
      style.setProperty("--findly-cart-notice-bg", design.cartNoticeBackgroundColor);
    if (design.cartNoticeTextColor)
      style.setProperty("--findly-cart-notice-text", design.cartNoticeTextColor);
    if (design.cartNoticeBorderColor)
      style.setProperty("--findly-cart-notice-border-color", design.cartNoticeBorderColor);
    if (design.cartNoticeBorderWidth !== undefined)
      style.setProperty("--findly-cart-notice-border-width", px(design.cartNoticeBorderWidth));
    if (design.cartNoticeBorderRadius !== undefined)
      style.setProperty("--findly-cart-notice-radius", px(design.cartNoticeBorderRadius));
    if (design.bannerColumns !== undefined)
      style.setProperty("--findly-banner-columns", design.bannerColumns);
    if (design.bannerTitleColor) style.setProperty("--findly-banner-title-color", design.bannerTitleColor);
    if (design.bannerPriceColor) style.setProperty("--findly-banner-price-color", design.bannerPriceColor);
    if (design.bannerTitleFontSize !== undefined)
      style.setProperty("--findly-banner-title-size", px(design.bannerTitleFontSize));
    if (design.bannerPriceFontSize !== undefined)
      style.setProperty("--findly-banner-price-size", px(design.bannerPriceFontSize));
    if (design.bannerButtonBackgroundColor)
      style.setProperty("--findly-banner-button-bg", design.bannerButtonBackgroundColor);
    if (design.bannerButtonTextColor)
      style.setProperty("--findly-banner-button-text", design.bannerButtonTextColor);
    // "custom" swaps the proportional sizing for fixed pixel dimensions;
    // "natural" keeps each image's own ratio uncropped; the other shapes
    // scale with however wide the grid columns end up.
    if (design.bannerImageAspect === "custom") {
      style.setProperty("--findly-banner-image-aspect", "auto");
      if (design.bannerImageHeight)
        style.setProperty("--findly-banner-image-height", px(design.bannerImageHeight));
      if (design.bannerImageWidth)
        style.setProperty("--findly-banner-image-width", px(design.bannerImageWidth));
    } else {
      var aspectMap = { square: "1 / 1", portrait: "3 / 4", landscape: "4 / 3" };
      style.setProperty(
        "--findly-banner-image-aspect",
        design.bannerImageAspect === "natural"
          ? "auto"
          : aspectMap[design.bannerImageAspect] || "1 / 1",
      );
      style.setProperty("--findly-banner-image-height", "auto");
      style.setProperty("--findly-banner-image-width", "100%");
    }
    if (design.bannerWidth) style.setProperty("--findly-banner-width", design.bannerWidth);
    if (design.bannerTitleMaxLines !== undefined)
      // 0 means "never clamp" - 99 lines is effectively that, while keeping
      // the CSS rule itself unconditional.
      style.setProperty(
        "--findly-banner-title-lines",
        design.bannerTitleMaxLines > 0 ? design.bannerTitleMaxLines : 99,
      );
    var alignMap = { left: "flex-start", center: "center", right: "flex-end" };
    style.setProperty(
      "--findly-banner-align-items",
      alignMap[design.bannerContentAlign] || "flex-start",
    );
    style.setProperty("--findly-banner-text-align", design.bannerContentAlign || "left");

    // Keyed per quiz id so each quiz's CSS is injected exactly once, but a
    // second quiz's different CSS still gets its own <style> tag instead of
    // being silently dropped.
    window.__findlyInjectedCssIds = window.__findlyInjectedCssIds || {};
    if (design.customCss && !window.__findlyInjectedCssIds[quiz.id]) {
      window.__findlyInjectedCssIds[quiz.id] = true;
      var styleTag = document.createElement("style");
      styleTag.textContent = design.customCss;
      document.head.appendChild(styleTag);
    }
  }

  function loadingEl(text) {
    var div = document.createElement("div");
    div.className = "findly-quiz__loading";
    div.textContent = text;
    return div;
  }

  function errorEl(text) {
    var div = document.createElement("div");
    div.className = "findly-quiz__error";
    div.textContent = text;
    return div;
  }

  function mount(container, quiz, proxyBase) {
    proxyBase = proxyBase || "/apps/findly";
    var state = { index: 0, answerIds: [] };
    var text = quiz.text || {};

    function renderQuestion() {
      container.innerHTML = "";
      var question = quiz.questions[state.index];

      var card = document.createElement("div");
      card.className = "findly-quiz__card";

      var progress = document.createElement("div");
      progress.className = "findly-quiz__progress";
      progress.textContent = (text.progress || "Question {current} of {total}")
        .replace("{current}", state.index + 1)
        .replace("{total}", quiz.questions.length);
      card.appendChild(progress);

      var heading = document.createElement("h3");
      heading.className = "findly-quiz__question";
      heading.textContent = question.text;
      card.appendChild(heading);

      var list = document.createElement("div");
      list.className = "findly-quiz__answers";
      question.answers.forEach(function (answer) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "findly-quiz__answer";
        btn.textContent = answer.text;
        btn.addEventListener("click", function () {
          selectAnswer(answer.id);
        });
        list.appendChild(btn);
      });
      card.appendChild(list);

      container.appendChild(card);
    }

    function selectAnswer(answerId) {
      state.answerIds.push(answerId);
      if (state.index + 1 < quiz.questions.length) {
        state.index += 1;
        renderQuestion();
      } else {
        submit();
      }
    }

    function submit() {
      container.innerHTML = "";
      container.appendChild(loadingEl(text.findingMatches || "Finding your matches…"));
      fetch(proxyBase + "/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerIds: state.answerIds }),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (data.mode === "banner") {
            renderResults(data.products || [], data.quizId);
          } else {
            window.location.href = data.redirectUrl || "/collections/all";
          }
        })
        .catch(function () {
          container.innerHTML = "";
          container.appendChild(errorEl(text.error || "Something went wrong. Please try again."));
        });
    }

    function formatPrice(price) {
      var design = quiz.design || {};
      // "custom" swaps the automatic currency (from the store's real
      // currencyCode) for whatever symbol/code the merchant typed - e.g. a
      // store actually billing in USD that still wants "RON"/"lei" shown.
      if (design.priceFormat === "custom" && design.priceCustomSymbol) {
        var amount = Number(price.amount).toFixed(2);
        return design.priceSymbolPosition === "before"
          ? design.priceCustomSymbol + amount
          : amount + " " + design.priceCustomSymbol;
      }
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: price.currencyCode,
        }).format(Number(price.amount));
      } catch (e) {
        return price.amount + " " + price.currencyCode;
      }
    }

    function addToCart(button, product, resultsQuizId, onAdded, quantity) {
      button.disabled = true;
      button.textContent = text.addingToCart || "Adding…";
      fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: product.variantId, quantity: quantity || 1 }] }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("add to cart failed");
          // Tags the cart so the orders/create webhook can attribute the
          // eventual order back to this quiz.
          return fetch("/cart/update.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attributes: { findly_quiz_id: resultsQuizId } }),
          });
        })
        .then(function () {
          button.textContent = text.addedToCart || "Added";
          fetch(proxyBase + "/add-to-cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quizId: resultsQuizId }),
          }).catch(function () {});
          onAdded();
        })
        .catch(function () {
          button.disabled = false;
          button.textContent = text.addToCart || "Add to cart";
        });
    }

    function renderResults(products, resultsQuizId) {
      container.innerHTML = "";

      // Inside a popup, the card wrap is sized to the quiz card's own
      // width - which would squeeze the results grid no matter what its
      // Grid width setting says. Let the wrap grow to the grid's width for
      // the results step.
      var popupWrap = container.parentElement;
      if (
        popupWrap &&
        popupWrap.classList &&
        popupWrap.classList.contains("findly-quiz__popup-card-wrap")
      ) {
        var bannerWidth = quiz.design && quiz.design.bannerWidth;
        popupWrap.style.maxWidth = bannerWidth && bannerWidth !== "100%" ? bannerWidth : "94vw";
      }

      var wrap = document.createElement("div");
      wrap.className = "findly-quiz__card findly-quiz__results";

      if (!products.length) {
        var empty = document.createElement("p");
        empty.textContent = text.noResults || "No matches found.";
        wrap.appendChild(empty);
        container.appendChild(wrap);
        return;
      }

      // "view-product" just links to the product page - no cart involved at
      // all, so the "View cart" notice below never applies to it.
      var buttonType = (quiz.design && quiz.design.bannerButtonType) || "add-to-cart";
      // "redirect" sends the shopper straight to /cart after the first add;
      // "link" (default) keeps them here so they can add more than one
      // match, surfacing a cart link instead of navigating away for them.
      var addToCartBehavior = (quiz.placement && quiz.placement.addToCartBehavior) || "link";
      var cartNotice = document.createElement("a");
      cartNotice.href = "/cart";
      cartNotice.className =
        "findly-quiz__cart-notice" +
        (quiz.design && quiz.design.cartNoticeFullWidth ? " findly-quiz__cart-notice--full" : "");
      cartNotice.textContent = text.viewCart || "View cart →";
      cartNotice.style.display = "none";

      var handleAdded = function () {
        if (addToCartBehavior === "redirect") {
          window.location.href = "/cart";
        } else {
          cartNotice.style.display = "";
        }
      };

      var grid = document.createElement("div");
      grid.className = "findly-quiz__grid";

      products.forEach(function (product) {
        var card = document.createElement("div");
        card.className = "findly-quiz__product";

        var link = document.createElement("a");
        link.href = "/products/" + product.handle;
        if (product.image) {
          var img = document.createElement("img");
          img.src = product.image.url;
          img.alt = product.image.altText || product.title;
          img.loading = "lazy";
          link.appendChild(img);
        }
        var title = document.createElement("div");
        title.className = "findly-quiz__product-title";
        title.textContent = product.title;
        link.appendChild(title);
        card.appendChild(link);

        var price = document.createElement("div");
        price.className = "findly-quiz__product-price";
        price.textContent = formatPrice(product.price);
        card.appendChild(price);

        if (buttonType === "view-product") {
          var viewBtn = document.createElement("a");
          viewBtn.href = "/products/" + product.handle;
          viewBtn.className = "findly-quiz__add-to-cart";
          viewBtn.textContent = text.viewProduct || "View product";
          card.appendChild(viewBtn);
        } else {
          // Opt-in - / + quantity picker; without it the button adds 1,
          // exactly as before.
          var qtyInput = null;
          if (quiz.design && quiz.design.bannerShowQuantity) {
            var qty = document.createElement("div");
            qty.className = "findly-quiz__qty";

            var minus = document.createElement("button");
            minus.type = "button";
            minus.textContent = "−";
            minus.setAttribute("aria-label", "Decrease quantity");

            qtyInput = document.createElement("input");
            qtyInput.type = "number";
            qtyInput.min = "1";
            qtyInput.value = "1";
            qtyInput.setAttribute("aria-label", "Quantity");

            var plus = document.createElement("button");
            plus.type = "button";
            plus.textContent = "+";
            plus.setAttribute("aria-label", "Increase quantity");

            minus.addEventListener("click", function () {
              qtyInput.value = String(Math.max(1, Number(qtyInput.value) - 1 || 1));
            });
            plus.addEventListener("click", function () {
              qtyInput.value = String(Math.max(1, Number(qtyInput.value) + 1 || 1));
            });

            qty.appendChild(minus);
            qty.appendChild(qtyInput);
            qty.appendChild(plus);
            card.appendChild(qty);
          }

          var addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "findly-quiz__add-to-cart";
          addBtn.textContent = text.addToCart || "Add to cart";
          addBtn.addEventListener("click", function () {
            var quantity = qtyInput ? Math.max(1, Math.floor(Number(qtyInput.value)) || 1) : 1;
            addToCart(addBtn, product, resultsQuizId, handleAdded, quantity);
          });
          card.appendChild(addBtn);
        }

        grid.appendChild(card);
      });

      wrap.appendChild(cartNotice);
      wrap.appendChild(grid);
      container.appendChild(wrap);
    }

    applyDesign(container, quiz);
    renderQuestion();

    // Fire-and-forget - a failed view ping shouldn't affect the quiz itself.
    fetch(proxyBase + "/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: quiz.id }),
    }).catch(function () {});
  }

  window.FindlyQuiz = { fetchQuizzes: fetchQuizzes, mount: mount };
})();
