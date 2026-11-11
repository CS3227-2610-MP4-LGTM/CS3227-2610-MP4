"use client";

import { useId, type RefObject } from "react";
import {
  categories, codeByteLimit, descriptionLimit, difficulties, draftFields, flawCountRange, languages,
  normalizeCode, orderedCategories, titleLimit, type DraftField, type DraftView,
} from "@/lib/author/drafts";
import { categoryLabels, difficultyLabels, languageLabels } from "@/lib/learner/challenges";

/** Raw control values; validation converts them with the shared AUT-01/AUT-02 rules. */
export type FormValues = {
  title: string;
  description: string;
  language: string;
  difficulty: string;
  workingCode: string;
  flawCount: string;
  categories: string[];
};
export type FormErrors = Partial<Record<DraftField, string>>;
export type FieldRefs = RefObject<Partial<Record<DraftField, HTMLElement | null>>>;

export const emptyForm: FormValues = {
  title: "", description: "", language: "", difficulty: "", workingCode: "", flawCount: "", categories: [],
};

export function formFrom(draft: DraftView): FormValues {
  return {
    title: draft.title, description: draft.description, language: draft.language, difficulty: draft.difficulty,
    workingCode: draft.workingCode, flawCount: String(draft.flawCount), categories: [...draft.categories],
  };
}

/** Converts control values into validator input; an empty choice counts as missing. */
export function formInput(values: FormValues): Record<DraftField, unknown> {
  return {
    ...values,
    language: values.language || undefined,
    difficulty: values.difficulty || undefined,
    flawCount: values.flawCount === "" ? undefined : Number(values.flawCount),
    categories: orderedCategories(values.categories),
  };
}

/** Fields whose submitted value differs from the saved draft. */
export function changedFields(values: FormValues, saved: DraftView, fields: readonly DraftField[]) {
  return fields.filter(field => {
    if (field === "categories") return orderedCategories(values.categories).join() !== orderedCategories(saved.categories).join();
    if (field === "flawCount") return values.flawCount !== String(saved.flawCount);
    if (field === "workingCode") return normalizeCode(values.workingCode) !== saved.workingCode;
    // Text is saved trimmed, so surrounding whitespace alone is not a change.
    return values[field].trim() !== saved[field];
  });
}

export function firstMessages(fieldErrors: Partial<Record<string, string[]>> | undefined): FormErrors {
  const errors: FormErrors = {};
  for (const field of draftFields) {
    const message = fieldErrors?.[field]?.[0];
    if (message) errors[field] = message;
  }
  return errors;
}

export function focusFirstInvalid(errors: FormErrors, refs: FieldRefs) {
  const field = draftFields.find(name => errors[name]);
  if (field) refs.current?.[field]?.focus();
}

const hints: Partial<Record<DraftField, string>> = {
  title: `Up to ${titleLimit} characters.`,
  description: `Up to ${descriptionLimit.toLocaleString("en-US")} characters.`,
  workingCode: `Paste one source file, up to ${codeByteLimit.toLocaleString("en-US")} bytes. Code is displayed, never run.`,
  flawCount: `Choose ${flawCountRange.min}–${flawCountRange.max} flaws.`,
  categories: "Choose 1–5 categories. Each generated flaw uses one of them.",
};

export function DraftFieldControls({ fields, values, errors, disabled = false, onChange, refs }: {
  fields: readonly DraftField[];
  values: FormValues;
  errors: FormErrors;
  disabled?: boolean;
  onChange: (values: FormValues) => void;
  refs: FieldRefs;
}) {
  const prefix = useId();
  const id = (field: DraftField) => `${prefix}-${field}`;
  const described = (field: DraftField) => [hints[field] && `${id(field)}-help`, errors[field] && `${id(field)}-error`]
    .filter(Boolean).join(" ") || undefined;
  const control = (field: DraftField) => ({
    id: id(field),
    name: field,
    required: true,
    disabled,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": described(field),
    ref: (element: HTMLElement | null) => { if (refs.current) refs.current[field] = element; },
  });
  const help = (field: DraftField) => hints[field] ? <p className="field-help" id={`${id(field)}-help`}>{hints[field]}</p> : null;
  const error = (field: DraftField) => errors[field] ? <p className="field-error" id={`${id(field)}-error`}>{errors[field]}</p> : null;
  const set = (field: keyof FormValues, value: FormValues[keyof FormValues]) => onChange({ ...values, [field]: value });

  return <>{fields.map(field => {
    switch (field) {
      case "title":
        return <div className="field" key={field}><label htmlFor={id(field)}>Title</label>
          <input type="text" {...control(field)} value={values.title} onChange={event => set("title", event.target.value)} />
          {help(field)}{error(field)}</div>;
      case "description":
        return <div className="field" key={field}><label htmlFor={id(field)}>Description</label>
          <textarea rows={4} {...control(field)} value={values.description} onChange={event => set("description", event.target.value)} />
          {help(field)}{error(field)}</div>;
      case "language":
        return <div className="field" key={field}><label htmlFor={id(field)}>Language</label>
          <select {...control(field)} value={values.language} onChange={event => set("language", event.target.value)}>
            <option value="">Choose a language</option>
            {languages.map(value => <option key={value} value={value}>{languageLabels[value]}</option>)}
          </select>{help(field)}{error(field)}</div>;
      case "difficulty":
        return <div className="field" key={field}><label htmlFor={id(field)}>Difficulty</label>
          <select {...control(field)} value={values.difficulty} onChange={event => set("difficulty", event.target.value)}>
            <option value="">Choose a difficulty</option>
            {difficulties.map(value => <option key={value} value={value}>{difficultyLabels[value]}</option>)}
          </select>{help(field)}{error(field)}</div>;
      case "workingCode":
        return <div className="field" key={field}><label htmlFor={id(field)}>Working code</label>
          <textarea className="code-input" rows={14} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off"
            {...control(field)} value={values.workingCode} onChange={event => set("workingCode", event.target.value)} />
          {help(field)}{error(field)}</div>;
      case "flawCount":
        return <div className="field" key={field}><label htmlFor={id(field)}>Flaw count</label>
          <select {...control(field)} value={values.flawCount} onChange={event => set("flawCount", event.target.value)}>
            <option value="">Choose a count</option>
            {Array.from({ length: flawCountRange.max - flawCountRange.min + 1 }, (_, index) => String(flawCountRange.min + index))
              .map(value => <option key={value} value={value}>{value}</option>)}
          </select>{help(field)}{error(field)}</div>;
      case "categories":
        return <fieldset className="field category-choices" key={field} aria-describedby={described(field)}
          aria-invalid={errors.categories ? true : undefined}>
          <legend>Flaw categories</legend>
          {categories.map((value, index) => <label key={value} className="choice">
            <input type="checkbox" name="categories" value={value} disabled={disabled}
              checked={values.categories.includes(value)}
              ref={index === 0 ? (element) => { if (refs.current) refs.current.categories = element; } : undefined}
              onChange={event => set("categories", event.target.checked
                ? orderedCategories([...values.categories, value])
                : values.categories.filter(category => category !== value))} />
            {categoryLabels[value]}
          </label>)}
          {help(field)}{error(field)}
        </fieldset>;
    }
  })}</>;
}
