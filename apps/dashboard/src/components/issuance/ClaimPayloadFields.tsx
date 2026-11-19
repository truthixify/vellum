import { Plus, Trash2 } from "lucide-react";

import {
  createEmptyClaimDraft,
  fieldLabel,
  type ClaimFormDraft,
  type ManifestFieldSchema,
} from "@/lib/claim-issuance";

type Props = {
  schema: ManifestFieldSchema;
  value: ClaimFormDraft;
  onChange: (value: ClaimFormDraft) => void;
  errors: Record<string, string>;
};

function objectDraft(value: ClaimFormDraft): Record<string, ClaimFormDraft> {
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

function fieldId(path: string): string {
  return `claim-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function fieldHint(schema: ManifestFieldSchema, required: boolean): string {
  const parts: string[] = [required ? "Required" : "Optional"];
  if (schema.format === "unix-time-seconds") parts.push("stored as Unix seconds");
  if (schema.minLength !== undefined && schema.maxLength === schema.minLength) {
    parts.push(`${schema.minLength} characters`);
  } else if (schema.maxLength !== undefined) {
    parts.push(`up to ${schema.maxLength} characters`);
  }
  if (schema.minimum !== undefined) parts.push(`minimum ${schema.minimum}`);
  if (schema.maximum !== undefined && schema.maximum !== Number.MAX_SAFE_INTEGER) {
    parts.push(`maximum ${schema.maximum}`);
  }
  if (schema.template) parts.push(`format ${schema.template}`);
  return parts.join(" · ");
}

function PrimitiveField({
  name,
  path,
  schema,
  value,
  required,
  error,
  onChange,
}: {
  name: string;
  path: string;
  schema: ManifestFieldSchema;
  value: ClaimFormDraft;
  required: boolean;
  error?: string;
  onChange: (value: ClaimFormDraft) => void;
}) {
  const id = fieldId(path);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const textValue = typeof value === "string" ? value : "";
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  return (
    <div className="issuance-field">
      <label htmlFor={id}>
        <span>{fieldLabel(name)}</span>
        {required && <b aria-hidden="true">*</b>}
      </label>
      {schema.enum ? (
        <select
          id={id}
          value={textValue}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a value</option>
          {schema.enum.map((option) => (
            <option key={option} value={option}>
              {fieldLabel(option)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={
            schema.format === "unix-time-seconds"
              ? "datetime-local"
              : schema.type === "integer"
                ? "number"
                : "text"
          }
          step={schema.format === "unix-time-seconds" ? 1 : undefined}
          inputMode={schema.type === "integer" ? "numeric" : undefined}
          value={textValue}
          readOnly={schema.const !== undefined}
          required={required}
          min={
            schema.type === "integer" && schema.minimum !== undefined ? schema.minimum : undefined
          }
          max={
            schema.type === "integer" && schema.maximum !== undefined ? schema.maximum : undefined
          }
          minLength={schema.type === "string" ? schema.minLength : undefined}
          maxLength={schema.type === "string" ? schema.maxLength : undefined}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <small id={hintId}>{fieldHint(schema, required)}</small>
      {error && (
        <small className="issuance-field__error" id={errorId} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

function SchemaField({
  name,
  path,
  schema,
  value,
  required,
  errors,
  onChange,
}: {
  name: string;
  path: string;
  schema: ManifestFieldSchema;
  value: ClaimFormDraft;
  required: boolean;
  errors: Record<string, string>;
  onChange: (value: ClaimFormDraft) => void;
}) {
  if (schema.type === "object") {
    const record = objectDraft(value);
    const requiredFields = new Set(schema.required ?? []);
    return (
      <fieldset className="issuance-object-field">
        <legend>{fieldLabel(name)}</legend>
        <div className="issuance-object-field__grid">
          {Object.entries(schema.properties ?? {}).map(([childName, childSchema]) => {
            const childPath = `${path}.${childName}`;
            return (
              <SchemaField
                key={childName}
                name={childName}
                path={childPath}
                schema={childSchema}
                value={record[childName] ?? createEmptyClaimDraft(childSchema)}
                required={requiredFields.has(childName)}
                errors={errors}
                onChange={(next) => onChange({ ...record, [childName]: next })}
              />
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (schema.type === "array") {
    const values = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? {};
    const atMaximum = schema.maxItems !== undefined && values.length >= schema.maxItems;
    return (
      <fieldset
        className="issuance-array-field"
        aria-describedby={errors[path] ? `${fieldId(path)}-error` : undefined}
      >
        <legend>
          <span>{fieldLabel(name)}</span>
          <small>
            {required ? "Required" : "Optional"}
            {schema.maxItems !== undefined ? ` · up to ${schema.maxItems}` : ""}
          </small>
        </legend>
        {values.length === 0 ? (
          <p className="issuance-array-field__empty">No items added.</p>
        ) : (
          <div className="issuance-array-field__items">
            {values.map((item, index) => (
              <div className="issuance-array-item" key={`${path}-${index}`}>
                <div className="issuance-array-item__header">
                  <strong>
                    {fieldLabel(name)} {index + 1}
                  </strong>
                  <button
                    type="button"
                    className="issuance-icon-button"
                    aria-label={`Remove ${fieldLabel(name)} ${index + 1}`}
                    title={`Remove ${fieldLabel(name)} ${index + 1}`}
                    onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <SchemaField
                  name={`item_${index + 1}`}
                  path={`${path}[${index}]`}
                  schema={itemSchema}
                  value={item}
                  required
                  errors={errors}
                  onChange={(next) =>
                    onChange(
                      values.map((current, itemIndex) => (itemIndex === index ? next : current)),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
        {errors[path] && (
          <small className="issuance-field__error" id={`${fieldId(path)}-error`} role="alert">
            {errors[path]}
          </small>
        )}
        <button
          type="button"
          className="issuance-add-button"
          disabled={atMaximum}
          onClick={() => onChange([...values, createEmptyClaimDraft(itemSchema)])}
        >
          <Plus size={15} aria-hidden="true" /> Add {fieldLabel(name).toLowerCase()}
        </button>
      </fieldset>
    );
  }

  return (
    <PrimitiveField
      name={name}
      path={path}
      schema={schema}
      value={value}
      required={required}
      error={errors[path]}
      onChange={onChange}
    />
  );
}

export function ClaimPayloadFields({ schema, value, onChange, errors }: Props) {
  if (schema.type !== "object") return null;
  const record = objectDraft(value);
  const requiredFields = new Set(schema.required ?? []);

  return (
    <div className="issuance-payload-fields">
      {Object.entries(schema.properties ?? {}).map(([name, fieldSchema]) => (
        <SchemaField
          key={name}
          name={name}
          path={name}
          schema={fieldSchema}
          value={record[name] ?? createEmptyClaimDraft(fieldSchema)}
          required={requiredFields.has(name)}
          errors={errors}
          onChange={(next) => onChange({ ...record, [name]: next })}
        />
      ))}
    </div>
  );
}
