import type { ResourceKind } from "./source";

export interface SystemInterest {
  interest_template_id: string;
  name: string;
  description?: string | null;
  positive_texts?: string[];
  negative_texts?: string[];
  must_have_terms?: string[];
  must_not_have_terms?: string[];
  places?: string[];
  languages_allowed?: string[];
  time_window_hours?: number | null;
  short_tokens_required?: string[];
  short_tokens_forbidden?: string[];
  allowed_content_kinds?: ResourceKind[];
  priority?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}
