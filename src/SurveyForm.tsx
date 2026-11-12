import { useMemo, useEffect, useState, useRef } from "react";
import { Model, settings } from "survey-core";
import { Survey } from "survey-react-ui";
import "survey-core/i18n/simplified-chinese";
import "survey-core/survey-core.fontless.min.css";
import { fields, type Answers } from "./questions";
import { routingFields } from "./question-options";
import { configureSurvey } from "./survey-routing";
export function SurveyForm({
  identity,
  mode,
  initial,
  onAnswers,
  onModel,
  appearance = "workbench",
}: {
  identity: string;
  mode: "simple" | "detailed";
  initial: Answers;
  onAnswers: (a: Answers) => void;
  onModel: (m: Model) => void;
  appearance?: "workbench" | "portfolio";
}) {
  const [step, setStep] = useState({ index: 1, total: 1 });
  const progressRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => {
    // Routing changes rebuild pages; avoid moving dropdown targets during transitions.
    settings.animationEnabled = false;
    const m = new Model();
    configureSurvey(m, { ...initial, mode }, false);
    m.onValidatedErrorsOnCurrentPage.add((_sender, options) => {
      const q = options.questions[0];
      if (!q) return;
      const input = document.getElementById(q.inputId);
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    // Replace SurveyJS's delayed page scroll with a synchronous scroll after
    // rendering, so it cannot close a dropdown the customer has just opened.
    m.onScrollToTop.add((_sender, options) => {
      if (options.element?.isPage) options.cancel = true;
    });
    let renderedPage: string | undefined;
    m.onAfterRenderPage.add((_sender, options) => {
      const previous = renderedPage;
      renderedPage = options.page.name;
      if (previous && previous !== renderedPage) {
        (progressRef.current ?? options.htmlElement).scrollIntoView({
          block: "start",
          behavior: "instant",
        });
        progressRef.current?.focus({ preventScroll: true });
      }
    });
    m.onCompleting.add((_sender, options) => {
      options.allowComplete = false;
    });
    m.applyTheme({
      themeName: "default",
      colorPalette: "light",
      isPanelless: true,
      cssVariables: {
        "--sjs-primary-backcolor": "#1b6558",
        "--sjs-primary-backcolor-dark": "#174e44",
        "--sjs-primary-backcolor-light": "#edf3f0",
        "--sjs-general-backcolor": "#ffffff",
        "--sjs-general-backcolor-dim": "#ffffff",
        "--sjs-general-backcolor-dim-light": "#ffffff",
        "--sjs-general-backcolor-dark": "#f3f5f6",
        "--sjs-general-forecolor": "#202a33",
        "--sjs-general-forecolor-light": "#596671",
        "--sjs-border-default": "#cbd3d8",
        "--sjs-border-light": "#dce1e5",
        "--sjs-font-size": "14px",
        "--sjs-font-family": "inherit",
        "--sjs-corner-radius": "5px",
        "--sjs-base-unit": "6px",
        ...(appearance === "portfolio"
          ? {
              "--sjs-primary-backcolor": "#635de5",
              "--sjs-primary-backcolor-dark": "#5b58ff",
              "--sjs-primary-backcolor-light": "#f1efff",
              "--sjs-primary-forecolor": "#ffffff",
              "--sjs-general-backcolor": "#ffffff",
              "--sjs-general-backcolor-dim": "#ffffff",
              "--sjs-general-backcolor-dim-light": "#f1efff",
              "--sjs-general-backcolor-dark": "#ffffff",
              "--sjs-general-forecolor": "#202124",
              "--sjs-general-forecolor-light": "#626670",
              "--sjs-border-default": "#818792",
              "--sjs-border-light": "#dfe2e7",
              "--sjs-special-red": "#a33c32",
            }
          : {}),
      },
    });
    return m;
  }, [identity, appearance]);
  useEffect(() => {
    model.setValue("mode", mode);
  }, [model, mode]);
  useEffect(() => {
    onModel(model);
    const updateProgress = () =>
      setStep({
        index: model.currentPageNo + 1,
        total: model.visiblePages.length,
      });
    let configuring = false;
    const handle = (_sender: Model, options: { name: string }) => {
      if (configuring) return;
      if (routingFields.includes(options.name)) {
        configuring = true;
        try {
          configureSurvey(model, model.data);
        } finally {
          configuring = false;
        }
      }
      const a: Answers = {};
      for (const f of fields)
        if (model.data[f] !== undefined) a[f] = structuredClone(model.data[f]);
      onAnswers(a);
      updateProgress();
    };
    updateProgress();
    model.onCurrentPageChanged.add(updateProgress);
    model.onValueChanged.add(handle);
    return () => {
      model.onCurrentPageChanged.remove(updateProgress);
      model.onValueChanged.remove(handle);
    };
  }, [model, onAnswers, onModel]);
  return (
    <>
      <div
        ref={progressRef}
        tabIndex={-1}
        className="questionnaire-progress"
        aria-label="问卷进度"
      >
        <span aria-live="polite">
          第 {step.index} / {step.total} 步
        </span>
        <span>每步最多 5 题</span>
        <div className="questionnaire-progress-track" aria-hidden="true">
          <i
            style={{
              transform: `scaleX(${step.index / Math.max(step.total, 1)})`,
            }}
          />
        </div>
      </div>
      <Survey model={model} />
    </>
  );
}
