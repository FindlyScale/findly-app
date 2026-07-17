import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  authenticate,
  isBillingTest,
  isPremiumPlan,
  isPaidPlan,
  getMaxQuizzes,
} from "../shopify.server";
import prisma from "../db.server";
import { getShopCatalog } from "../models/shopCatalog.server";

const MAX_QUESTIONS = 5;
const MAX_ANSWERS = 6;

const DESIGN_FIELDS = [
  "accentColor",
  "backgroundColor",
  "textColor",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "maxWidth",
  "customCss",
  "fontFamily",
  "questionFontSize",
  "answerFontSize",
  "cartNoticeBackgroundColor",
  "cartNoticeTextColor",
  "cartNoticeBorderColor",
  "cartNoticeBorderWidth",
  "cartNoticeBorderRadius",
  "cartNoticeFullWidth",
  "placementMode",
  "resultsMode",
  "addToCartBehavior",
  "popupDelaySeconds",
  "popupShowCloseButton",
  "popupAlwaysOnHomepage",
  "popupFrequencyMinutes",
  "collectionHandle",
  "inlineShowMode",
  "bannerColumns",
  "bannerMaxProducts",
  "bannerButtonType",
  "bannerShowQuantity",
  "bannerContentAlign",
  "bannerTitleColor",
  "bannerPriceColor",
  "bannerTitleFontSize",
  "bannerPriceFontSize",
  "bannerButtonBackgroundColor",
  "bannerButtonTextColor",
  "priceFormat",
  "priceCustomSymbol",
  "priceSymbolPosition",
  "bannerImageAspect",
  "bannerImageWidth",
  "bannerImageHeight",
  "bannerWidth",
  "bannerTitleMaxLines",
  "tagMatchMode",
  "popupButtonPosition",
  "popupButtonBackgroundColor",
  "popupButtonTextColor",
];

const FONT_STACKS = {
  inherit: null,
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};
const TEXT_FIELDS = [
  "textFindingMatches",
  "textError",
  "textProgress",
  "textFloatingButton",
  "textNoResults",
  "textAddToCart",
  "textAddingToCart",
  "textAddedToCart",
  "textViewCart",
  "textViewProduct",
];

const emptyAnswer = () => ({ text: "", matchType: "tag", tag: "", minPrice: "", maxPrice: "" });
const emptyQuestion = () => ({ text: "", answers: [emptyAnswer()] });

export const loader = async ({ request, params }) => {
  const { session, billing } = await authenticate.admin(request);

  const quiz = await prisma.quiz.findFirst({
    where: { id: params.id, shop: session.shop },
    include: {
      questions: {
        orderBy: { position: "asc" },
        include: { answers: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!quiz) throw new Response("Not found", { status: 404 });

  const [{ appSubscriptions }, catalog] = await Promise.all([
    billing.check({ isTest: isBillingTest }),
    getShopCatalog(session.shop),
  ]);

  return {
    quiz,
    isPremium: isPremiumPlan(appSubscriptions),
    isPaid: isPaidPlan(appSubscriptions),
    availableTags: catalog.tags,
    availableCollections: catalog.collections,
  };
};

export const action = async ({ request, params }) => {
  const { session, billing } = await authenticate.admin(request);

  const existing = await prisma.quiz.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!existing) throw new Response("Not found", { status: 404 });

  const body = await request.json();

  const designData = Object.fromEntries(DESIGN_FIELDS.map((key) => [key, body[key]]));
  designData.collectionHandle = designData.collectionHandle ? designData.collectionHandle.trim() : null;
  const textData = Object.fromEntries(TEXT_FIELDS.map((key) => [key, body[key] || ""]));

  // Feature gating, enforced server-side too, not just by disabling the
  // inputs in the UI: popup placement needs a paid plan; custom placement,
  // the results banner, and raw CSS need Premium.
  const { appSubscriptions } = await billing.check({ isTest: isBillingTest });
  if (!isPaidPlan(appSubscriptions)) {
    if (designData.placementMode === "popup") designData.placementMode = "auto";
  }
  if (!isPremiumPlan(appSubscriptions)) {
    if (designData.placementMode === "custom") designData.placementMode = "auto";
    if (designData.resultsMode === "banner") designData.resultsMode = "redirect";
    designData.customCss = "";
  }

  // The plan's published-quiz limit applies here just like on the
  // dashboard's toggle - otherwise publishing from the editor would be a
  // way around it. The rest of the save still goes through; only the
  // publish part gets refused.
  let published = Boolean(body.published);
  let limitError = null;
  if (published && !existing.published) {
    const maxQuizzes = getMaxQuizzes(appSubscriptions);
    const publishedCount = await prisma.quiz.count({
      where: { shop: session.shop, published: true },
    });
    if (publishedCount >= maxQuizzes) {
      published = false;
      limitError = `Your plan allows up to ${maxQuizzes} published quiz${maxQuizzes === 1 ? "" : "es"} at once - this quiz was saved as a draft. Unpublish another quiz, or upgrade on the Plans page.`;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.quiz.update({
      where: { id: params.id },
      data: { title: body.title, published, ...designData, ...textData },
    });

    // Full replace on every save keeps this simple: no diffing between
    // existing/new questions and answers, at MVP scale (<=5 questions) the
    // cost of recreating rows is negligible.
    await tx.question.deleteMany({ where: { quizId: params.id } });

    for (let i = 0; i < body.questions.length; i++) {
      const question = body.questions[i];
      const answers = question.answers
        .filter((answer) => {
          if (!answer.text) return false;
          return answer.matchType === "price"
            ? answer.minPrice !== "" || answer.maxPrice !== ""
            : Boolean(answer.tag);
        })
        .map((answer, j) => ({
          text: answer.text,
          position: j,
          tag: answer.matchType === "price" ? null : answer.tag,
          minPrice: answer.matchType === "price" && answer.minPrice !== "" ? Number(answer.minPrice) : null,
          maxPrice: answer.matchType === "price" && answer.maxPrice !== "" ? Number(answer.maxPrice) : null,
        }));

      await tx.question.create({
        data: {
          quizId: params.id,
          text: question.text,
          position: i,
          answers: { create: answers },
        },
      });
    }
  });

  return { ok: true, published, limitError };
};

/* eslint-disable react/prop-types -- plain JS project, no prop-types
   package; props here are plain objects/values, not worth a schema. */
// All structural chrome below (cards, borders, spacing) is hand-styled
// plain HTML/CSS rather than s-box/s-section/s-stack. Those Polaris web
// components turned out to render inconsistently depending on nesting depth
// (a border shows up one level deep but not at the top level, with no
// visible cause) - not worth a third round of guessing. Plain inline styles
// are fully deterministic. Polaris is still used for the actual form
// controls (s-text-field, s-select, etc.), which render fine regardless of
// what kind of element wraps them.
const CARD_BORDER = "1px solid #e1e3e5";

function FieldGroup({ title, children }) {
  return (
    <div
      style={{
        border: CARD_BORDER,
        borderRadius: "8px",
        background: "#fafbfb",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#6b7177",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <div
      style={{
        border: CARD_BORDER,
        borderRadius: "12px",
        background: "#ffffff",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div>
        <div style={{ fontSize: "15px", fontWeight: 650 }}>{title}</div>
        {description && (
          <div style={{ fontSize: "13px", color: "#6b7177", marginTop: "2px", lineHeight: 1.4 }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function SectionStack({ children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>{children}</div>;
}

// Collapsed by default (whole point is to not show a wall of fields for
// every question at once) - the header row is its own button so the entire
// row toggles, not just the tiny chevron icon.
function QuestionCard({ index, questionText, expanded, onToggle, children }) {
  return (
    <div style={{ border: CARD_BORDER, borderRadius: "12px", background: "#ffffff", overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "16px 20px",
          background: "transparent",
          border: "none",
          margin: 0,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
          appearance: "none",
          WebkitAppearance: "none",
        }}
      >
        <div>
          <div style={{ fontSize: "15px", fontWeight: 650 }}>Question {index + 1}</div>
          {questionText && (
            <div style={{ fontSize: "13px", color: "#6b7177", marginTop: "2px" }}>{questionText}</div>
          )}
        </div>
        <s-icon type={expanded ? "chevron-up" : "chevron-down"} />
      </button>
      {expanded && (
        <div
          style={{
            padding: "0 20px 20px",
            borderTop: CARD_BORDER,
            paddingTop: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Generic "text field with a filtered suggestion dropdown below it" used
// for both the tag and collection pickers - a plain absolutely-positioned
// div rather than any Polaris popover/combobox primitive, for the same
// reliability reason as SectionCard/FieldGroup above.
function SuggestField({ label, details, value, onChange, options, renderOption, getOptionValue }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const query = (value || "").trim().toLowerCase();
  const matches = options
    .filter((option) => {
      const optionValue = getOptionValue(option);
      return query ? optionValue.toLowerCase().includes(query) && optionValue !== value : true;
    })
    .slice(0, 8);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <s-text-field
        label={label}
        details={details}
        value={value}
        onFocus={() => setOpen(true)}
        onInput={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            marginTop: "4px",
            background: "#ffffff",
            border: CARD_BORDER,
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {matches.map((option) => {
            const optionValue = getOptionValue(option);
            return (
              <button
                key={optionValue}
                type="button"
                onClick={() => {
                  onChange(optionValue);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 12px",
                  background: "transparent",
                  border: "none",
                  margin: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "13px",
                  font: "inherit",
                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              >
                <span style={{ opacity: 0.5, fontWeight: 600 }}>+</span>
                {renderOption(option)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// options come from ShopCatalog (synced from the Admin API - see
// app/models/shopCatalog.server.js), not hardcoded or guessed. If a store
// hasn't synced yet (or has none of that kind), this quietly behaves like
// a plain text field - no suggestions, no error.
function TagPicker({ value, onChange, availableTags }) {
  return (
    <SuggestField
      label="Matches product tag"
      details="Only products carrying this exact tag will match this answer"
      value={value}
      onChange={onChange}
      options={availableTags}
      getOptionValue={(tag) => tag}
      renderOption={(tag) => tag}
    />
  );
}

function CollectionPicker({ value, onChange, availableCollections }) {
  return (
    <SuggestField
      label="Collection handle"
      details={'The part after /collections/ in the URL, e.g. "winter-collection"'}
      value={value}
      onChange={onChange}
      options={availableCollections}
      getOptionValue={(collection) => collection.handle}
      renderOption={(collection) => (
        <span>
          {collection.handle}
          <span style={{ opacity: 0.6 }}> — {collection.title}</span>
        </span>
      )}
    />
  );
}

// No slider primitive exists in this Polaris web-component set, so this is
// a plain native <input type="range"> - fully reliable, unlike guessing at
// undocumented custom-element behavior (see FieldGroup/SectionCard above).
function SliderField({ label, details, value, onChange, min, max, step }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "6px",
          fontSize: "13px",
          fontWeight: 500,
        }}
      >
        <span>{label}</span>
        <span style={{ opacity: 0.65 }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      {details && (
        <div style={{ fontSize: "12px", color: "#6b7177", marginTop: "4px" }}>{details}</div>
      )}
    </div>
  );
}

function QuizPreview({ form }) {
  const [step, setStep] = useState(0);
  const questions = form.questions.filter((q) => q.text);
  const activeIndex = questions.length ? Math.min(step, questions.length - 1) : 0;
  const question = questions[activeIndex];

  const fontFamily = FONT_STACKS[form.fontFamily] || "system-ui, sans-serif";

  const cardStyle = {
    maxWidth: form.maxWidth === "480px" ? "100%" : form.maxWidth,
    width: "100%",
    margin: "0 auto",
    padding: "24px",
    boxSizing: "border-box",
    borderStyle: "solid",
    borderWidth: `${form.borderWidth}px`,
    borderColor: form.borderColor,
    borderRadius: `${form.borderRadius}px`,
    textAlign: "center",
    background: form.backgroundColor,
    color: form.textColor,
    fontFamily: fontFamily,
  };
  // display:flex + gap (not marginBottom) for spacing between buttons -
  // margin-based spacing was getting collapsed/overridden by the Shopify
  // admin's own ambient <button> styles. appearance/boxShadow/margin are
  // reset explicitly for the same reason: plain native <button> elements
  // inherit admin chrome unless every property is stated outright.
  const answersWrapStyle = { display: "flex", flexDirection: "column", gap: "8px" };
  const answerStyle = {
    display: "block",
    width: "100%",
    margin: 0,
    padding: "12px 16px",
    boxSizing: "border-box",
    border: `1px solid ${form.borderColor}`,
    borderRadius: `${Math.round(form.borderRadius * 0.6)}px`,
    background: form.backgroundColor,
    color: form.textColor,
    cursor: "pointer",
    fontSize: `${form.answerFontSize}px`,
    fontFamily: fontFamily,
    boxShadow: "none",
    appearance: "none",
    WebkitAppearance: "none",
  };

  const progressText = (form.textProgress || "Question {current} of {total}")
    .replace("{current}", activeIndex + 1)
    .replace("{total}", questions.length || 1);

  return (
    <div
      style={{
        border: "1px solid #e1e3e5",
        borderRadius: "12px",
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      {/* Faux browser chrome so the preview reads as "this is your
          storefront", not just another settings card. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "10px 14px",
          borderBottom: "1px solid #e1e3e5",
          background: "#fafbfb",
        }}
      >
        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f4b8b4" }} />
        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f5d9a8" }} />
        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#b8d8b9" }} />
        <span
          style={{
            marginLeft: "8px",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "#6b7177",
          }}
        >
          Live preview
        </span>
      </div>

      <div style={{ padding: "20px", background: "#f6f6f7" }}>
        <div style={cardStyle}>
          {!question ? (
            <p style={{ margin: 0, opacity: 0.6 }}>Add a question to see the preview</p>
          ) : (
            <>
              <div
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.6,
                  marginBottom: "8px",
                }}
              >
                {progressText}
              </div>
              <h3 style={{ margin: "0 0 16px", fontSize: `${form.questionFontSize}px`, fontFamily }}>
                {question.text}
              </h3>
              <div style={answersWrapStyle}>
                {(question.answers.length ? question.answers : [{ text: "Answer text" }]).map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    style={answerStyle}
                    onClick={() => setStep((s) => (questions.length ? (s + 1) % questions.length : 0))}
                  >
                    {a.text || "Answer text"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #e1e3e5",
          fontSize: "12px",
          color: "#6b7177",
          lineHeight: 1.4,
        }}
      >
        Click an answer to step through the quiz. Custom CSS only applies on your live
        storefront.
      </div>
    </div>
  );
}
/* eslint-enable react/prop-types */

export default function QuizEditor() {
  const { quiz, isPremium, isPaid, availableTags, availableCollections } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [activeTab, setActiveTab] = useState("questions");
  // Questions collapsed by default so the tab isn't a wall of fields -
  // tracked by index rather than a stable id since local question state
  // never had one (see emptyQuestion()). Index 0 starts open so there's
  // something to look at on a fresh quiz.
  const [expandedQuestions, setExpandedQuestions] = useState(() => new Set([0]));
  const toggleQuestion = (qIndex) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qIndex)) next.delete(qIndex);
      else next.add(qIndex);
      return next;
    });
  };

  const [form, setForm] = useState(() => ({
    title: quiz.title,
    published: quiz.published,
    questions: quiz.questions.length
      ? quiz.questions.map((q) => ({
          text: q.text,
          answers: q.answers.map((a) => ({
            text: a.text,
            matchType: a.tag ? "tag" : "price",
            tag: a.tag || "",
            minPrice: a.minPrice != null ? String(a.minPrice) : "",
            maxPrice: a.maxPrice != null ? String(a.maxPrice) : "",
          })),
        }))
      : [emptyQuestion()],
    ...Object.fromEntries(DESIGN_FIELDS.map((key) => [key, quiz[key]])),
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, quiz[key]])),
    collectionHandle: quiz.collectionHandle ?? "",
  }));
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (!fetcher.data?.ok) return;
    if (fetcher.data.limitError) {
      shopify.toast.show(fetcher.data.limitError, { isError: true });
    } else {
      shopify.toast.show(fetcher.data.published ? "Quiz saved and live" : "Quiz saved");
    }
    // The server may have refused the publish part (plan limit) - reflect
    // its final say in the header button instead of showing a stale state.
    const serverPublished = fetcher.data.published;
    setForm((f) => (f.published === serverPublished ? f : { ...f, published: serverPublished }));
  }, [fetcher.data, shopify]);

  const updateQuestion = (qIndex, field, value) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === qIndex ? { ...q, [field]: value } : q)),
    }));
  };

  const addQuestion = () => {
    if (form.questions.length >= MAX_QUESTIONS) return;
    const newIndex = form.questions.length;
    setForm((f) => ({ ...f, questions: [...f.questions, emptyQuestion()] }));
    setExpandedQuestions((prev) => new Set(prev).add(newIndex));
  };

  const removeQuestion = (qIndex) => {
    setForm((f) => ({ ...f, questions: f.questions.filter((_, i) => i !== qIndex) }));
    // Indices shift down by one after the removed question, so the expanded
    // set has to shift with them or the wrong questions end up open.
    setExpandedQuestions((prev) => {
      const next = new Set();
      prev.forEach((i) => {
        if (i < qIndex) next.add(i);
        else if (i > qIndex) next.add(i - 1);
      });
      return next;
    });
  };

  const updateAnswer = (qIndex, aIndex, field, value) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIndex
          ? { ...q, answers: q.answers.map((a, j) => (j === aIndex ? { ...a, [field]: value } : a)) }
          : q,
      ),
    }));
  };

  const addAnswer = (qIndex) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIndex && q.answers.length < MAX_ANSWERS
          ? { ...q, answers: [...q.answers, emptyAnswer()] }
          : q,
      ),
    }));
  };

  const removeAnswer = (qIndex, aIndex) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIndex ? { ...q, answers: q.answers.filter((_, j) => j !== aIndex) } : q,
      ),
    }));
  };

  const handleSave = () => {
    fetcher.submit(form, { method: "POST", encType: "application/json" });
  };

  // One click: saves everything AND flips publish state, so there's no
  // "save here, then go publish from the dashboard" round trip. Submits an
  // explicit payload rather than relying on setForm having applied yet.
  const handleTogglePublish = () => {
    const next = !form.published;
    setForm((f) => ({ ...f, published: next }));
    fetcher.submit({ ...form, published: next }, { method: "POST", encType: "application/json" });
  };

  // One tab per concern, in the order a merchant actually works: write the
  // questions, choose where the quiz shows up, style it, decide what the
  // results look like, translate the built-in text.
  const TABS = [
    { key: "questions", label: "Questions" },
    { key: "placement", label: "Placement" },
    { key: "design", label: "Design" },
    { key: "results", label: "Results" },
    { key: "translations", label: "Translations" },
  ];

  return (
    <s-page heading={form.title || "Quiz"}>
      <s-link href="/app/quiz">&larr; Back to quizzes</s-link>

      <s-button slot="primary-action" onClick={handleSave} {...(isSaving ? { loading: true } : {})}>
        Save quiz
      </s-button>
      <s-button
        slot="secondary-actions"
        {...(isSaving ? { disabled: true } : {})}
        {...(form.published ? { tone: "critical" } : {})}
        onClick={handleTogglePublish}
      >
        {form.published ? "Set to draft" : "Publish quiz"}
      </s-button>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", marginTop: "16px" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          {/* Segmented tab control - one visual unit instead of a row of
              disconnected buttons. */}
          <div
            style={{
              display: "inline-flex",
              background: "#f1f2f4",
              borderRadius: "10px",
              padding: "4px",
              gap: "2px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: "8px 16px",
                    border: "none",
                    margin: 0,
                    borderRadius: "8px",
                    background: active ? "#ffffff" : "transparent",
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                    font: "inherit",
                    fontWeight: 600,
                    fontSize: "13px",
                    color: active ? "#1a1a1a" : "#6b7177",
                    cursor: "pointer",
                    appearance: "none",
                    WebkitAppearance: "none",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "questions" && (
            <SectionStack>
              <SectionCard title="Quiz settings">
                <s-text-field
                  label="Quiz name"
                  details="Internal only - not shown to customers"
                  value={form.title}
                  onInput={(e) => set("title")(e.target.value)}
                />
              </SectionCard>

              {form.questions.map((question, qIndex) => (
                <QuestionCard
                  key={qIndex}
                  index={qIndex}
                  questionText={question.text}
                  expanded={expandedQuestions.has(qIndex)}
                  onToggle={() => toggleQuestion(qIndex)}
                >
                  <s-text-field
                    label="Question text"
                    value={question.text}
                    onInput={(e) => updateQuestion(qIndex, "text", e.target.value)}
                  />

                  <s-stack direction="block" gap="base">
                    {question.answers.map((answer, aIndex) => (
                      <FieldGroup key={aIndex} title={`Answer ${aIndex + 1}`}>
                        <s-stack direction="inline" gap="base">
                          <s-text-field
                            label="Answer text"
                            value={answer.text}
                            onInput={(e) => updateAnswer(qIndex, aIndex, "text", e.target.value)}
                          />
                          <s-select
                            label="Match by"
                            value={answer.matchType}
                            onChange={(e) => updateAnswer(qIndex, aIndex, "matchType", e.target.value)}
                          >
                            <s-option value="tag">Product tag</s-option>
                            <s-option value="price">Price range</s-option>
                          </s-select>
                        </s-stack>

                        {answer.matchType === "tag" ? (
                          <>
                            <TagPicker
                              value={answer.tag}
                              onChange={(value) => updateAnswer(qIndex, aIndex, "tag", value)}
                              availableTags={availableTags}
                            />
                            {answer.tag && availableTags.length > 0 && !availableTags.includes(answer.tag) && (
                              <s-banner tone="warning" heading="No products currently have this tag">
                                <s-paragraph>
                                  Double-check the spelling, or this answer won&apos;t match any
                                  products yet.
                                </s-paragraph>
                              </s-banner>
                            )}
                          </>
                        ) : (
                          <s-stack direction="inline" gap="base">
                            <s-number-field
                              label="Min price"
                              min={0}
                              value={answer.minPrice}
                              onChange={(e) => updateAnswer(qIndex, aIndex, "minPrice", e.target.value)}
                            />
                            <s-number-field
                              label="Max price"
                              min={0}
                              value={answer.maxPrice}
                              onChange={(e) => updateAnswer(qIndex, aIndex, "maxPrice", e.target.value)}
                            />
                          </s-stack>
                        )}

                        {question.answers.length > 1 && (
                          <s-button
                            variant="secondary"
                            tone="critical"
                            onClick={() => removeAnswer(qIndex, aIndex)}
                          >
                            Remove answer
                          </s-button>
                        )}
                      </FieldGroup>
                    ))}
                  </s-stack>

                  {question.answers.length < MAX_ANSWERS && (
                    <s-button variant="secondary" onClick={() => addAnswer(qIndex)}>
                      Add answer
                    </s-button>
                  )}

                  {form.questions.length > 1 && (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <s-button
                        variant="secondary"
                        tone="critical"
                        onClick={() => removeQuestion(qIndex)}
                      >
                        Remove question
                      </s-button>
                    </div>
                  )}
                </QuestionCard>
              ))}

              {form.questions.length < MAX_QUESTIONS && (
                <button
                  type="button"
                  onClick={addQuestion}
                  style={{
                    width: "100%",
                    padding: "14px",
                    border: "1px dashed #c9cccf",
                    borderRadius: "12px",
                    background: "transparent",
                    font: "inherit",
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "#4a4a4a",
                    cursor: "pointer",
                    appearance: "none",
                    WebkitAppearance: "none",
                  }}
                >
                  + Add question ({form.questions.length}/{MAX_QUESTIONS})
                </button>
              )}
            </SectionStack>
          )}

          {activeTab === "placement" && (
            <SectionStack>
              <SectionCard title="Placement" description="How the quiz gets onto your storefront.">
                <s-stack direction="block" gap="base">
                  <s-select
                    label="Placement mode"
                    value={form.placementMode}
                    onChange={(e) => set("placementMode")(e.target.value)}
                  >
                    <s-option value="auto">Homepage - shown only on your homepage, no setup</s-option>
                    <s-option value="collection">On collection page - shown on one collection</s-option>
                    <s-option value="popup" disabled={!isPaid}>
                      Popup{!isPaid ? " (Standard plan)" : ""} - appears after a delay, any page
                    </s-option>
                    <s-option value="custom" disabled={!isPremium}>
                      Custom{!isPremium ? " (Premium plan)" : ""} - I&apos;ll place it myself in the
                      theme editor
                    </s-option>
                  </s-select>
                  {!isPremium && (
                    <s-paragraph>
                      {!isPaid
                        ? "Popup placement is available from the Standard plan, custom placement on Premium. "
                        : "Custom placement is a Premium plan feature. "}
                      See <s-link href="/app/plans">Plans</s-link>.
                    </s-paragraph>
                  )}

                  {form.placementMode === "collection" && (
                    <CollectionPicker
                      value={form.collectionHandle}
                      onChange={set("collectionHandle")}
                      availableCollections={availableCollections}
                    />
                  )}

                  {form.placementMode === "popup" && (
                    <FieldGroup title="Popup settings">
                      <s-select
                        label="Show popup after"
                        details="Delay from page load until the popup appears"
                        value={String(form.popupDelaySeconds)}
                        onChange={(e) => set("popupDelaySeconds")(Number(e.target.value))}
                      >
                        <s-option value="0">Instantly</s-option>
                        <s-option value="3">3 seconds</s-option>
                        <s-option value="5">5 seconds</s-option>
                        <s-option value="10">10 seconds</s-option>
                      </s-select>

                      <s-checkbox
                        label="Show a close button on the popup"
                        details="An escape route (clicking outside the popup also closes it) always stays available either way"
                        checked={form.popupShowCloseButton}
                        onChange={(e) => set("popupShowCloseButton")(e.target.checked)}
                      />

                      <s-checkbox
                        label="Always show on every homepage visit"
                        details="Overrides the frequency limit below, but only on the homepage"
                        checked={form.popupAlwaysOnHomepage}
                        onChange={(e) => set("popupAlwaysOnHomepage")(e.target.checked)}
                      />

                      <s-number-field
                        label="Minimum minutes between popups for the same visitor"
                        details={'Ignored while "always show on homepage" is on'}
                        min={0}
                        max={1440}
                        disabled={form.popupAlwaysOnHomepage}
                        value={form.popupFrequencyMinutes}
                        onChange={(e) => set("popupFrequencyMinutes")(Number(e.target.value))}
                      />
                    </FieldGroup>
                  )}

                  {form.placementMode === "popup" && (
                    <FieldGroup title="Floating button">
                      <s-paragraph>
                        A &quot;Take the quiz&quot; button that stays on screen so visitors can
                        always open the popup themselves. Its text is editable on the
                        Translations tab.
                      </s-paragraph>
                      <s-select
                        label="Position"
                        value={form.popupButtonPosition}
                        onChange={(e) => set("popupButtonPosition")(e.target.value)}
                      >
                        <s-option value="left">Left edge, centered - vertical tab</s-option>
                        <s-option value="right">Right edge, centered - vertical tab</s-option>
                        <s-option value="bottom-left">Bottom left corner</s-option>
                        <s-option value="bottom-right">Bottom right corner</s-option>
                      </s-select>
                      <s-stack direction="inline" gap="base">
                        <s-color-field
                          label="Background"
                          value={form.popupButtonBackgroundColor}
                          onChange={(e) => set("popupButtonBackgroundColor")(e.target.value)}
                        />
                        <s-color-field
                          label="Text"
                          value={form.popupButtonTextColor}
                          onChange={(e) => set("popupButtonTextColor")(e.target.value)}
                        />
                      </s-stack>
                    </FieldGroup>
                  )}

                  {form.placementMode === "custom" && (
                    <s-paragraph>
                      Add the &quot;Findly Quiz&quot; block yourself from the theme editor, using
                      the button on the quiz list page.
                    </s-paragraph>
                  )}

                  {(form.placementMode === "auto" || form.placementMode === "collection") && (
                    <s-select
                      label="How the quiz appears"
                      details="Whether the quiz mounts right away, or waits for the shopper to open it"
                      value={form.inlineShowMode}
                      onChange={(e) => set("inlineShowMode")(e.target.value)}
                    >
                      <s-option value="immediate">Show the quiz immediately</s-option>
                      <s-option value="button">
                        Show a &quot;Take the quiz&quot; button first
                      </s-option>
                    </s-select>
                  )}

                  {(form.placementMode === "auto" ||
                    form.placementMode === "collection" ||
                    form.placementMode === "popup") && (
                    <s-paragraph>
                      Turn on the &quot;Findly Quiz&quot; app embed once in your theme editor - use
                      the button on the quiz list page.
                    </s-paragraph>
                  )}
                </s-stack>
              </SectionCard>
            </SectionStack>
          )}

          {activeTab === "results" && (
            <SectionStack>
              <SectionCard title="Results" description="What happens after the last question.">
                <s-stack direction="block" gap="base">
                  <s-select
                    label="Tag matching"
                    details="How the tags picked across the questions combine when finding products"
                    value={form.tagMatchMode}
                    onChange={(e) => set("tagMatchMode")(e.target.value)}
                  >
                    <s-option value="any">
                      Any tag - products matching at least one answer are shown (broader)
                    </s-option>
                    <s-option value="all">
                      All tags - products must match every answer (narrower)
                    </s-option>
                  </s-select>

                  <s-select
                    label="Results mode"
                    value={form.resultsMode}
                    onChange={(e) => set("resultsMode")(e.target.value)}
                  >
                    <s-option value="redirect">
                      Redirect to search - simplest, matches your theme exactly
                    </s-option>
                    <s-option value="banner" disabled={!isPremium}>
                      Show results in the quiz{!isPremium ? " (Premium plan)" : ""} - with Add to
                      Cart and conversion tracking
                    </s-option>
                  </s-select>
                  {!isPremium && (
                    <s-paragraph>
                      The in-quiz results banner is a Premium plan feature. See{" "}
                      <s-link href="/app/plans">Plans</s-link>.
                    </s-paragraph>
                  )}

                  {form.resultsMode === "banner" && (
                    <s-select
                      label="After Add to cart"
                      value={form.addToCartBehavior}
                      onChange={(e) => set("addToCartBehavior")(e.target.value)}
                    >
                      <s-option value="link">
                        Show a &quot;View cart&quot; link - shopper can keep browsing the other matches
                      </s-option>
                      <s-option value="redirect">Redirect straight to the cart page</s-option>
                    </s-select>
                  )}
                </s-stack>
              </SectionCard>

              {form.resultsMode === "banner" && form.addToCartBehavior === "link" && (
                <SectionCard
                  title="Cart button"
                  description={'Styling for the "View cart" link shown after Add to cart.'}
                >
                  <s-stack direction="block" gap="loose">
                    <FieldGroup title="Colors">
                      <s-color-field
                        label="Background"
                        details="The button's fill color"
                        value={form.cartNoticeBackgroundColor}
                        onChange={(e) => set("cartNoticeBackgroundColor")(e.target.value)}
                      />
                      <s-color-field
                        label="Text"
                        details={'Color of the "View cart" label'}
                        value={form.cartNoticeTextColor}
                        onChange={(e) => set("cartNoticeTextColor")(e.target.value)}
                      />
                      <s-color-field
                        label="Border"
                        details="Only visible if border width below is above 0px"
                        value={form.cartNoticeBorderColor}
                        onChange={(e) => set("cartNoticeBorderColor")(e.target.value)}
                      />
                    </FieldGroup>

                    <FieldGroup title="Shape">
                      <s-stack direction="inline" gap="base">
                        <s-number-field
                          label="Border width (px)"
                          min={0}
                          max={8}
                          value={form.cartNoticeBorderWidth}
                          onChange={(e) => set("cartNoticeBorderWidth")(Number(e.target.value))}
                        />
                        <s-number-field
                          label="Corner radius (px)"
                          min={0}
                          max={40}
                          value={form.cartNoticeBorderRadius}
                          onChange={(e) => set("cartNoticeBorderRadius")(Number(e.target.value))}
                        />
                      </s-stack>
                      <s-checkbox
                        label="Full width"
                        details="Stretch the button across the card instead of sizing to its text"
                        checked={form.cartNoticeFullWidth}
                        onChange={(e) => set("cartNoticeFullWidth")(e.target.checked)}
                      />
                    </FieldGroup>
                  </s-stack>
                </SectionCard>
              )}
            </SectionStack>
          )}

          {activeTab === "design" && (
            <SectionStack>
              <SectionCard title="Appearance">
                <s-stack direction="block" gap="loose">
                  <FieldGroup title="Colors">
                    <s-color-field
                      label="Accent"
                      details="Answer button borders on hover, and the Add to cart button"
                      value={form.accentColor}
                      onChange={(e) => set("accentColor")(e.target.value)}
                    />
                    <s-color-field
                      label="Background"
                      details="The card's fill color"
                      value={form.backgroundColor}
                      onChange={(e) => set("backgroundColor")(e.target.value)}
                    />
                    <s-color-field
                      label="Text"
                      details="Question and answer text color"
                      value={form.textColor}
                      onChange={(e) => set("textColor")(e.target.value)}
                    />
                    <s-color-field
                      label="Border"
                      details="Card and answer button outlines"
                      value={form.borderColor}
                      onChange={(e) => set("borderColor")(e.target.value)}
                    />
                  </FieldGroup>

                  <FieldGroup title="Border &amp; size">
                    <s-stack direction="inline" gap="base">
                      <s-number-field
                        label="Border width (px)"
                        min={0}
                        max={8}
                        value={form.borderWidth}
                        onChange={(e) => set("borderWidth")(Number(e.target.value))}
                      />
                      <s-number-field
                        label="Corner radius (px)"
                        min={0}
                        max={40}
                        value={form.borderRadius}
                        onChange={(e) => set("borderRadius")(Number(e.target.value))}
                      />
                    </s-stack>
                    <s-select
                      label="Card width"
                      details="How wide the whole quiz card is on your storefront"
                      value={form.maxWidth}
                      onChange={(e) => set("maxWidth")(e.target.value)}
                    >
                      <s-option value="480px">Standard</s-option>
                      <s-option value="50%">Half width</s-option>
                      <s-option value="100%">Full width</s-option>
                    </s-select>
                  </FieldGroup>

                  <FieldGroup title="Typography">
                    <s-select
                      label="Font"
                      details={"“Match theme” inherits your store's own font"}
                      value={form.fontFamily}
                      onChange={(e) => set("fontFamily")(e.target.value)}
                    >
                      <s-option value="inherit">Match theme (recommended)</s-option>
                      <s-option value="sans">Sans-serif</s-option>
                      <s-option value="serif">Serif</s-option>
                      <s-option value="mono">Monospace</s-option>
                    </s-select>
                    <s-stack direction="inline" gap="base">
                      <s-number-field
                        label="Question size (px)"
                        min={12}
                        max={40}
                        value={form.questionFontSize}
                        onChange={(e) => set("questionFontSize")(Number(e.target.value))}
                      />
                      <s-number-field
                        label="Answer size (px)"
                        min={10}
                        max={28}
                        value={form.answerFontSize}
                        onChange={(e) => set("answerFontSize")(Number(e.target.value))}
                      />
                    </s-stack>
                  </FieldGroup>
                </s-stack>
              </SectionCard>

              <SectionCard
                title="Custom CSS"
                description={
                  <>
                    Written on top of everything above, for anything more specific. Applies only
                    to the quiz widget on your storefront.
                    {!isPremium && (
                      <>
                        {" "}
                        This is a Premium plan feature. See <s-link href="/app/plans">Plans</s-link>.
                      </>
                    )}
                  </>
                }
              >
                <s-text-area
                  label="CSS"
                  labelAccessibilityVisibility="exclusive"
                  rows={12}
                  disabled={!isPremium}
                  placeholder=".findly-quiz__answer { font-family: serif; }"
                  value={form.customCss}
                  onInput={(e) => set("customCss")(e.target.value)}
                />
              </SectionCard>
            </SectionStack>
          )}

          {activeTab === "results" && form.resultsMode === "banner" && (
            // Rendered as a sibling block of the Results stack above (same
            // tab, two conditionals) - the marginTop stands in for the gap
            // the shared SectionStack would otherwise provide.
            <div style={{ marginTop: "20px" }}>
              <SectionCard
                title="Results grid"
                description={
                  "How the matched products are laid out inside the quiz. These settings only " +
                  'apply while Results mode above is "Show results in the quiz".'
                }
              >
                <s-stack direction="block" gap="loose">
                  <FieldGroup title="Layout">
                    <s-select
                      label="Grid width"
                      details="Wider grids mean bigger product cards"
                      value={form.bannerWidth}
                      onChange={(e) => set("bannerWidth")(e.target.value)}
                    >
                      <s-option value="">Match the quiz card width</s-option>
                      <s-option value="720px">Wide (720px)</s-option>
                      <s-option value="960px">Extra wide (960px)</s-option>
                      <s-option value="100%">Full width</s-option>
                    </s-select>
                    <SliderField
                      label="Products per row"
                      details="Fewer per row also means bigger product cards"
                      value={form.bannerColumns}
                      onChange={set("bannerColumns")}
                      min={1}
                      max={6}
                    />
                    <SliderField
                      label="Max products shown"
                      details="Total products shown across all rows, after matching"
                      value={form.bannerMaxProducts}
                      onChange={set("bannerMaxProducts")}
                      min={1}
                      max={24}
                    />
                    <s-select
                      label="Image shape"
                      value={form.bannerImageAspect}
                      onChange={(e) => set("bannerImageAspect")(e.target.value)}
                    >
                      <s-option value="natural">Adapt to image - no cropping</s-option>
                      <s-option value="square">Square (1:1)</s-option>
                      <s-option value="portrait">Portrait (3:4)</s-option>
                      <s-option value="landscape">Landscape (4:3)</s-option>
                      <s-option value="custom">Custom size in pixels</s-option>
                    </s-select>
                    {form.bannerImageAspect === "custom" && (
                      <s-stack direction="inline" gap="base">
                        <s-number-field
                          label="Image width (px)"
                          min={80}
                          max={800}
                          value={form.bannerImageWidth}
                          onChange={(e) => set("bannerImageWidth")(Number(e.target.value))}
                        />
                        <s-number-field
                          label="Image height (px)"
                          min={80}
                          max={800}
                          value={form.bannerImageHeight}
                          onChange={(e) => set("bannerImageHeight")(Number(e.target.value))}
                        />
                      </s-stack>
                    )}
                    <s-select
                      label="Title length"
                      details={'Long titles get cut off with "…" so all cards line up evenly'}
                      value={String(form.bannerTitleMaxLines)}
                      onChange={(e) => set("bannerTitleMaxLines")(Number(e.target.value))}
                    >
                      <s-option value="1">1 line</s-option>
                      <s-option value="2">2 lines</s-option>
                      <s-option value="3">3 lines</s-option>
                      <s-option value="0">Show full title</s-option>
                    </s-select>
                    <s-select
                      label="Content alignment"
                      details="Title, price and button alignment within each product card"
                      value={form.bannerContentAlign}
                      onChange={(e) => set("bannerContentAlign")(e.target.value)}
                    >
                      <s-option value="left">Left</s-option>
                      <s-option value="center">Center</s-option>
                      <s-option value="right">Right</s-option>
                    </s-select>
                  </FieldGroup>

                  <FieldGroup title="Button">
                    <s-select
                      label="Button action"
                      value={form.bannerButtonType}
                      onChange={(e) => set("bannerButtonType")(e.target.value)}
                    >
                      <s-option value="add-to-cart">
                        Add to cart - adds the item directly, tracks conversions
                      </s-option>
                      <s-option value="view-product">
                        View product - links to the product page instead
                      </s-option>
                    </s-select>
                    {form.bannerButtonType === "add-to-cart" && (
                      <s-checkbox
                        label="Show a quantity selector"
                        details="A - / + picker next to Add to cart, so shoppers can add several at once"
                        checked={form.bannerShowQuantity}
                        onChange={(e) => set("bannerShowQuantity")(e.target.checked)}
                      />
                    )}
                    <s-stack direction="inline" gap="base">
                      <s-color-field
                        label="Background"
                        value={form.bannerButtonBackgroundColor}
                        onChange={(e) => set("bannerButtonBackgroundColor")(e.target.value)}
                      />
                      <s-color-field
                        label="Text"
                        value={form.bannerButtonTextColor}
                        onChange={(e) => set("bannerButtonTextColor")(e.target.value)}
                      />
                    </s-stack>
                  </FieldGroup>

                  <FieldGroup title="Price">
                    <s-select
                      label="Currency display"
                      details="Automatic uses your store's real currency and locale formatting"
                      value={form.priceFormat}
                      onChange={(e) => set("priceFormat")(e.target.value)}
                    >
                      <s-option value="auto">Automatic</s-option>
                      <s-option value="custom">Custom symbol or code</s-option>
                    </s-select>
                    {form.priceFormat === "custom" && (
                      <s-stack direction="inline" gap="base">
                        <s-text-field
                          label="Symbol or code"
                          details={'e.g. "RON", "lei", "€"'}
                          value={form.priceCustomSymbol}
                          onInput={(e) => set("priceCustomSymbol")(e.target.value)}
                        />
                        <s-select
                          label="Position"
                          value={form.priceSymbolPosition}
                          onChange={(e) => set("priceSymbolPosition")(e.target.value)}
                        >
                          <s-option value="before">Before amount</s-option>
                          <s-option value="after">After amount</s-option>
                        </s-select>
                      </s-stack>
                    )}
                  </FieldGroup>

                  <FieldGroup title="Typography">
                    <s-stack direction="inline" gap="base">
                      <s-color-field
                        label="Title color"
                        value={form.bannerTitleColor}
                        onChange={(e) => set("bannerTitleColor")(e.target.value)}
                      />
                      <s-number-field
                        label="Title size (px)"
                        min={10}
                        max={28}
                        value={form.bannerTitleFontSize}
                        onChange={(e) => set("bannerTitleFontSize")(Number(e.target.value))}
                      />
                    </s-stack>
                    <s-stack direction="inline" gap="base">
                      <s-color-field
                        label="Price color"
                        value={form.bannerPriceColor}
                        onChange={(e) => set("bannerPriceColor")(e.target.value)}
                      />
                      <s-number-field
                        label="Price size (px)"
                        min={10}
                        max={24}
                        value={form.bannerPriceFontSize}
                        onChange={(e) => set("bannerPriceFontSize")(Number(e.target.value))}
                      />
                    </s-stack>
                  </FieldGroup>
                </s-stack>
              </SectionCard>
            </div>
          )}

          {activeTab === "translations" && (
            <SectionStack>
              <SectionCard
                title="Storefront text"
                description={
                  "Your questions and answers are already in whatever language you wrote them in - " +
                  "this is only for the widget's built-in text, useful if your store isn't in English. " +
                  "Every piece of text the widget can show is listed below - nothing is hardcoded."
                }
              >
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="Progress text"
                    details={'{current} and {total} get replaced automatically, e.g. "Question 2 of 4"'}
                    value={form.textProgress}
                    onInput={(e) => set("textProgress")(e.target.value)}
                  />
                  <s-text-field
                    label="Submitting text"
                    details="Shown after the last question, while matching products"
                    value={form.textFindingMatches}
                    onInput={(e) => set("textFindingMatches")(e.target.value)}
                  />
                  <s-text-field
                    label="Error text"
                    details="Shown if matching products fails for any reason"
                    value={form.textError}
                    onInput={(e) => set("textError")(e.target.value)}
                  />
                  <s-text-field
                    label="Floating button text"
                    details="Only used in Popup placement mode, after the popup has been closed once"
                    value={form.textFloatingButton}
                    onInput={(e) => set("textFloatingButton")(e.target.value)}
                  />
                </s-stack>
              </SectionCard>

              <SectionCard
                title="Banner results text"
                description={
                  'Only used when Results mode is "Show results in the quiz" (Premium plan) - see ' +
                  "the Design tab."
                }
              >
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="No matches text"
                    details="Shown if no products match the shopper's answers"
                    value={form.textNoResults}
                    onInput={(e) => set("textNoResults")(e.target.value)}
                  />
                  <s-text-field
                    label="Add to cart button"
                    value={form.textAddToCart}
                    onInput={(e) => set("textAddToCart")(e.target.value)}
                  />
                  <s-text-field
                    label="Add to cart button (while adding)"
                    details="Shown briefly while the item is being added"
                    value={form.textAddingToCart}
                    onInput={(e) => set("textAddingToCart")(e.target.value)}
                  />
                  <s-text-field
                    label="Add to cart button (after adding)"
                    value={form.textAddedToCart}
                    onInput={(e) => set("textAddedToCart")(e.target.value)}
                  />
                  <s-text-field
                    label="View cart link"
                    details={'Shown after Add to cart when "After Add to cart" is set to "link"'}
                    value={form.textViewCart}
                    onInput={(e) => set("textViewCart")(e.target.value)}
                  />
                  <s-text-field
                    label="View product button"
                    details={'Shown instead of Add to cart when the Collection tab\'s button action is "View product"'}
                    value={form.textViewProduct}
                    onInput={(e) => set("textViewProduct")(e.target.value)}
                  />
                </s-stack>
              </SectionCard>
            </SectionStack>
          )}
        </div>

        <div style={{ width: "340px", flexShrink: 0, position: "sticky", top: "16px" }}>
          <QuizPreview form={form} />
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
