import { FormField, Input } from "@signalops/ui";

import type { ChannelEditorFormValue } from "./channel-editor-form-model";

interface ChannelEditorApiMappingFieldsProps {
  value: ChannelEditorFormValue;
  inputClassName: string;
}

function formatApiFieldPath(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? fallback;
}

export function ChannelEditorApiMappingFields({
  value,
  inputClassName,
}: ChannelEditorApiMappingFieldsProps) {
  return (
    <>
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-foreground">JSON field mapping</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Use dot paths when the response nests article data inside objects. The
          defaults match a top-level <code>items</code> array with common news
          property names.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField
          label="Items path"
          name="channel-items-path"
          helpText="Array path inside the JSON payload, for example items or data.records."
          helpWide
        >
          <Input
            id="channel-items-path"
            name="itemsPath"
            defaultValue={value.itemsPath ?? "items"}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="Title field"
          name="channel-title-field"
          helpText="Property that contains the article headline."
        >
          <Input
            id="channel-title-field"
            name="titleField"
            defaultValue={formatApiFieldPath(value.titleField, "title")}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="Lead field"
          name="channel-lead-field"
          helpText="Property that contains the summary or lead text."
        >
          <Input
            id="channel-lead-field"
            name="leadField"
            defaultValue={formatApiFieldPath(value.leadField, "lead")}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="Body field"
          name="channel-body-field"
          helpText="Property that contains the full or long-form article body."
        >
          <Input
            id="channel-body-field"
            name="bodyField"
            defaultValue={formatApiFieldPath(value.bodyField, "body")}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="URL field"
          name="channel-url-field"
          helpText="Property that contains the canonical article URL."
        >
          <Input
            id="channel-url-field"
            name="urlField"
            defaultValue={formatApiFieldPath(value.urlField, "url")}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="Published-at field"
          name="channel-published-at-field"
          helpText="Property that contains the published timestamp."
        >
          <Input
            id="channel-published-at-field"
            name="publishedAtField"
            defaultValue={formatApiFieldPath(value.publishedAtField, "publishedAt")}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="External ID field"
          name="channel-external-id-field"
          helpText="Property used as the stable per-item source identifier."
        >
          <Input
            id="channel-external-id-field"
            name="externalIdField"
            defaultValue={formatApiFieldPath(value.externalIdField, "id")}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="Language field"
          name="channel-language-field"
          helpText="Property that contains the item language code."
        >
          <Input
            id="channel-language-field"
            name="languageField"
            defaultValue={formatApiFieldPath(value.languageField, "language")}
            className={inputClassName}
          />
        </FormField>
      </div>
    </>
  );
}
