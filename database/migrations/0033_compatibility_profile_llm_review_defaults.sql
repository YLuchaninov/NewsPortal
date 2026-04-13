update selection_profiles
set
  policy_json = jsonb_set(
    coalesce(policy_json, '{}'::jsonb),
    '{llmReviewMode}',
    '"always"'::jsonb,
    true
  ),
  version = version + 1,
  updated_at = now()
where profile_family = 'compatibility_interest_template'
  and coalesce(policy_json ->> 'llmReviewMode', 'optional_high_value_only')
    = 'optional_high_value_only';
