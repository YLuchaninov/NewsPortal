from __future__ import annotations

from typing import Any

from infra.scripts.workers.smoke_fixtures import (
    Decimal,
    FakeJob,
    LLM_REVIEW_REQUESTED_EVENT,
    LlmAnalyzerPlugin,
    WebSearchPlugin,
    align_phase4_criterion_prototype,
    align_phase4_interest_prototype,
    build_live_discovery_runtime,
    cleanup_llm_cost_review_fixture,
    clear_zero_shot_derived_state_for_doc,
    configure_discovery_runtime,
    discovery_enabled,
    ensure_criterion_fixture,
    ensure_embed_fixture,
    ensure_interest_fixture,
    ensure_llm_cost_review_fixture,
    ensure_normalize_dedup_fixture,
    ensure_notification_channel_fixture,
    ensure_outbox_event,
    ensure_reindex_job_fixture,
    fake_ddgs_client,
    fake_gemini_server,
    fetch_criterion_match_result,
    fetch_latest_llm_review,
    fetch_latest_signal_candidate_event_id,
    fetch_llm_review_count,
    fetch_match_counts,
    fetch_notification_count,
    fetch_system_feed_result,
    force_phase4_user_interest_match,
    get_discovery_runtime,
    insert_budget_exhaustion_review,
    isolate_phase4_criterion_scope,
    os,
    patched_smoke_delivery,
    process_cluster,
    process_criterion_compile,
    process_dedup,
    process_embed,
    process_interest_compile,
    process_llm_review,
    process_match_criteria,
    process_match_interests,
    process_normalize,
    process_notify,
    process_reindex,
    reset_discovery_runtime,
    restore_phase4_criterion_scope,
    stable_uuid,
    temporary_environment,
    uuid,
    verify_cluster_match_notify,
    verify_criterion_compile,
    verify_embed,
    verify_interest_compile,
    verify_normalize_dedup,
    verify_reindex_backfill,
    verify_system_feed_result_consistency,
)

async def run_embed_smoke() -> dict[str, Any]:
    doc_id = await ensure_embed_fixture()
    event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=event_id,
        event_type="signal_candidate.normalized",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    result = await process_embed(
        FakeJob({"eventId": event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await verify_embed(doc_id)
    return result


async def run_normalize_dedup_smoke() -> dict[str, Any]:
    doc_id, _channel_id = await ensure_normalize_dedup_fixture()
    ingest_event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=ingest_event_id,
        event_type="signal_candidate.ingest.requested",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    normalize_result = await process_normalize(
        FakeJob(
            {
                "eventId": ingest_event_id,
                "docId": doc_id,
                "version": 1,
                "suppressDownstreamOutbox": True,
            }
        ),
        "",
    )
    normalized_event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=normalized_event_id,
        event_type="signal_candidate.normalized",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    dedup_result = await process_dedup(
        FakeJob({"eventId": normalized_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await verify_normalize_dedup(doc_id, ingest_event_id, normalized_event_id)
    return {
        "status": "deduped",
        "docId": doc_id,
        "normalize": normalize_result,
        "dedup": dedup_result,
    }


async def run_interest_compile_smoke() -> dict[str, Any]:
    interest_id = await ensure_interest_fixture()
    event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=event_id,
        event_type="interest.compile.requested",
        aggregate_type="interest",
        aggregate_id=interest_id,
        payload={"interestId": interest_id, "version": 2},
    )
    result = await process_interest_compile(
        FakeJob(
            {
                "eventId": event_id,
                "interestId": interest_id,
                "version": 2,
                "skipAutoRepair": True,
            }
        ),
        "",
    )
    await verify_interest_compile(interest_id)
    return result


async def run_criterion_compile_smoke() -> dict[str, Any]:
    criterion_id = await ensure_criterion_fixture()
    event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=event_id,
        event_type="criterion.compile.requested",
        aggregate_type="criterion",
        aggregate_id=criterion_id,
        payload={"criterionId": criterion_id, "version": 3},
    )
    result = await process_criterion_compile(
        FakeJob({"eventId": event_id, "criterionId": criterion_id, "version": 3}),
        "",
    )
    await verify_criterion_compile(criterion_id)
    return result


async def run_cluster_match_notify_smoke() -> dict[str, Any]:
    doc_id = await ensure_embed_fixture()
    interest_id = await ensure_interest_fixture()
    criterion_id = await ensure_criterion_fixture()
    await ensure_notification_channel_fixture()

    interest_event_id = str(uuid.uuid4())
    criterion_event_id = str(uuid.uuid4())
    normalized_event_id = str(uuid.uuid4())
    embedded_event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=interest_event_id,
        event_type="interest.compile.requested",
        aggregate_type="interest",
        aggregate_id=interest_id,
        payload={"interestId": interest_id, "version": 2},
    )
    await ensure_outbox_event(
        event_id=criterion_event_id,
        event_type="criterion.compile.requested",
        aggregate_type="criterion",
        aggregate_id=criterion_id,
        payload={"criterionId": criterion_id, "version": 3},
    )
    await process_interest_compile(
        FakeJob(
            {
                "eventId": interest_event_id,
                "interestId": interest_id,
                "version": 2,
                "skipAutoRepair": True,
            }
        ),
        "",
    )
    await process_criterion_compile(
        FakeJob({"eventId": criterion_event_id, "criterionId": criterion_id, "version": 3}),
        "",
    )

    criterion_scope = await isolate_phase4_criterion_scope(criterion_id)
    await ensure_outbox_event(
        event_id=normalized_event_id,
        event_type="signal_candidate.normalized",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    embed_result = await process_embed(
        FakeJob({"eventId": normalized_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await align_phase4_criterion_prototype(doc_id, criterion_id)
    await align_phase4_interest_prototype(doc_id, interest_id)
    await ensure_outbox_event(
        event_id=embedded_event_id,
        event_type="signal_candidate.embedded",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    try:
        criterion_result = await process_match_criteria(
            FakeJob({"eventId": embedded_event_id, "docId": doc_id, "version": 1}),
            "",
        )
    finally:
        await restore_phase4_criterion_scope(criterion_scope)
    criteria_matched_event_id = await fetch_latest_signal_candidate_event_id(
        doc_id,
        "signal_candidate.criteria.matched",
    )
    cluster_result = await process_cluster(
        FakeJob({"eventId": criteria_matched_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    clustered_event_id = await fetch_latest_signal_candidate_event_id(
        doc_id,
        "signal_candidate.clustered",
    )
    interest_result = await process_match_interests(
        FakeJob({"eventId": clustered_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await force_phase4_user_interest_match(doc_id, interest_id)
    matched_interest_event_id = await fetch_latest_signal_candidate_event_id(
        doc_id,
        "signal_candidate.interests.matched",
    )
    with patched_smoke_delivery():
        notify_result = await process_notify(
            FakeJob({"eventId": matched_interest_event_id, "docId": doc_id, "version": 1}),
            "",
        )
    await verify_cluster_match_notify(doc_id)
    return {
        "status": "phase4-ok",
        "docId": doc_id,
        "embed": embed_result,
        "cluster": cluster_result,
        "criteria": criterion_result,
        "interests": interest_result,
        "notify": notify_result,
    }


async def run_reindex_backfill_smoke() -> dict[str, Any]:
    doc_id = await ensure_embed_fixture()
    interest_id = await ensure_interest_fixture()
    criterion_id = await ensure_criterion_fixture()
    await ensure_notification_channel_fixture()

    interest_event_id = str(uuid.uuid4())
    criterion_event_id = str(uuid.uuid4())
    normalized_event_id = str(uuid.uuid4())
    embedded_event_id = str(uuid.uuid4())
    reindex_event_id = str(uuid.uuid4())
    reindex_job_id = str(stable_uuid("reindex-backfill-job"))

    await ensure_outbox_event(
        event_id=interest_event_id,
        event_type="interest.compile.requested",
        aggregate_type="interest",
        aggregate_id=interest_id,
        payload={"interestId": interest_id, "version": 2},
    )
    await ensure_outbox_event(
        event_id=criterion_event_id,
        event_type="criterion.compile.requested",
        aggregate_type="criterion",
        aggregate_id=criterion_id,
        payload={"criterionId": criterion_id, "version": 3},
    )
    await process_interest_compile(
        FakeJob(
            {
                "eventId": interest_event_id,
                "interestId": interest_id,
                "version": 2,
                "skipAutoRepair": True,
            }
        ),
        "",
    )
    await process_criterion_compile(
        FakeJob({"eventId": criterion_event_id, "criterionId": criterion_id, "version": 3}),
        "",
    )
    criterion_scope = await isolate_phase4_criterion_scope(criterion_id)
    await ensure_outbox_event(
        event_id=normalized_event_id,
        event_type="signal_candidate.normalized",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    await process_embed(
        FakeJob({"eventId": normalized_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await align_phase4_criterion_prototype(doc_id, criterion_id)
    await align_phase4_interest_prototype(doc_id, interest_id)
    await ensure_outbox_event(
        event_id=embedded_event_id,
        event_type="signal_candidate.embedded",
        aggregate_type="signal_candidate",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    try:
        await process_match_criteria(
            FakeJob({"eventId": embedded_event_id, "docId": doc_id, "version": 1}),
            "",
        )
    finally:
        await restore_phase4_criterion_scope(criterion_scope)
    criteria_matched_event_id = await fetch_latest_signal_candidate_event_id(
        doc_id,
        "signal_candidate.criteria.matched",
    )
    await process_cluster(
        FakeJob({"eventId": criteria_matched_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    clustered_event_id = await fetch_latest_signal_candidate_event_id(
        doc_id,
        "signal_candidate.clustered",
    )
    await process_match_interests(
        FakeJob({"eventId": clustered_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await force_phase4_user_interest_match(doc_id, interest_id)
    matched_interest_event_id = await fetch_latest_signal_candidate_event_id(
        doc_id,
        "signal_candidate.interests.matched",
    )
    with patched_smoke_delivery():
        await process_notify(
            FakeJob({"eventId": matched_interest_event_id, "docId": doc_id, "version": 1}),
            "",
        )
    await verify_cluster_match_notify(doc_id)
    criterion_count_before, interest_count_before = await fetch_match_counts(doc_id)
    notification_count_before = await fetch_notification_count(doc_id)
    await clear_zero_shot_derived_state_for_doc(doc_id)
    await ensure_reindex_job_fixture(reindex_job_id, doc_id)
    await ensure_outbox_event(
        event_id=reindex_event_id,
        event_type="reindex.requested",
        aggregate_type="reindex_job",
        aggregate_id=reindex_job_id,
        payload={"reindexJobId": reindex_job_id, "indexName": "interest_centroids", "version": 1},
    )
    reindex_criterion_scope = await isolate_phase4_criterion_scope(criterion_id)
    try:
        reindex_result = await process_reindex(
            FakeJob(
                {
                    "eventId": reindex_event_id,
                    "reindexJobId": reindex_job_id,
                    "indexName": "interest_centroids",
                }
            ),
            "",
        )
    finally:
        await restore_phase4_criterion_scope(reindex_criterion_scope)
    backfill_result = dict(reindex_result.get("backfill") or {})
    if int(backfill_result.get("interestLlmReviews") or 0) != 0:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: interest-scope LLM review was unexpectedly replayed."
        )
    await verify_reindex_backfill(
        doc_id,
        reindex_job_id=reindex_job_id,
        expected_criterion_count=criterion_count_before,
        expected_interest_count=interest_count_before,
        expected_notification_count=notification_count_before,
        expected_enrichment_state="skipped",
    )
    return {
        "status": "reindex-backfill-ok",
        "docId": doc_id,
        "reindex": reindex_result,
    }


async def run_llm_cost_proof_smoke() -> dict[str, Any]:
    channel_id, doc_id, criterion_id = await ensure_llm_cost_review_fixture()
    event_id = str(uuid.uuid4())
    fake_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"decision":"approve","score":0.91,"reason":"synthetic provider usage proof"}'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 200,
            "candidatesTokenCount": 100,
            "totalTokenCount": 300,
        },
    }

    try:
        await ensure_outbox_event(
            event_id=event_id,
            event_type=LLM_REVIEW_REQUESTED_EVENT,
            aggregate_type="criterion",
            aggregate_id=criterion_id,
            payload={
                "docId": doc_id,
                "scope": "criterion",
                "targetId": criterion_id,
                "version": 1,
            },
        )
        with fake_gemini_server(fake_payload) as (base_url, request_paths):
            with temporary_environment(
                {
                    "GEMINI_API_KEY": "local-proof-key",
                    "GEMINI_MODEL": "gemini-3.1-flash-lite",
                    "GEMINI_BASE_URL": base_url,
                    "LLM_INPUT_COST_PER_MILLION_USD": "0.25",
                    "LLM_OUTPUT_COST_PER_MILLION_USD": "1.50",
                }
            ):
                result = await process_llm_review(
                    FakeJob(
                        {
                            "eventId": event_id,
                            "docId": doc_id,
                            "scope": "criterion",
                            "targetId": criterion_id,
                        }
                    ),
                    "",
                )

        review_row = await fetch_latest_llm_review(doc_id)
        if review_row is None:
            raise RuntimeError("LLM cost proof smoke failed: llm_review_log row was not written.")
        if int(review_row.get("prompt_tokens") or 0) != 200:
            raise RuntimeError("LLM cost proof smoke failed: prompt_tokens did not match provider usage.")
        if int(review_row.get("completion_tokens") or 0) != 100:
            raise RuntimeError("LLM cost proof smoke failed: completion_tokens did not match provider usage.")
        if int(review_row.get("total_tokens") or 0) != 300:
            raise RuntimeError("LLM cost proof smoke failed: total_tokens did not match provider usage.")

        cost_text = str(review_row.get("cost_estimate_usd") or "").strip()
        if Decimal(cost_text or "0").quantize(Decimal("0.000001")) != Decimal("0.000200"):
            raise RuntimeError("LLM cost proof smoke failed: cost_estimate_usd did not match the expected tariff.")

        provider_usage = review_row.get("provider_usage_json")
        if not isinstance(provider_usage, dict):
            raise RuntimeError("LLM cost proof smoke failed: provider_usage_json is not a JSON object.")
        usage_metadata = provider_usage.get("usageMetadata")
        if not isinstance(usage_metadata, dict) or int(usage_metadata.get("totalTokenCount") or 0) != 300:
            raise RuntimeError(
                "LLM cost proof smoke failed: provider_usage_json.usageMetadata did not preserve provider totals."
            )
        if provider_usage.get("priceCardSource") != "env_override":
            raise RuntimeError("LLM cost proof smoke failed: priceCardSource did not reflect the env override path.")
        if len(request_paths) != 1:
            raise RuntimeError("LLM cost proof smoke failed: fake Gemini endpoint was not called exactly once.")

        system_feed = await fetch_system_feed_result(doc_id)
        verify_system_feed_result_consistency(system_feed, require_criteria_counts=True)

        return {
            "status": "llm-cost-proof-ok",
            "docId": doc_id,
            "criterionId": criterion_id,
            "reviewId": review_row["review_id"],
            "costEstimateUsd": cost_text,
            "providerPath": request_paths[0],
            "result": result,
        }
    finally:
        await cleanup_llm_cost_review_fixture(
            channel_id=channel_id,
            doc_id=doc_id,
            criterion_id=criterion_id,
            event_id=event_id,
        )


async def run_llm_budget_stop_smoke() -> dict[str, Any]:
    fake_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"decision":"approve","score":0.91,"reason":"provider should not be called in budget smoke"}'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 200,
            "candidatesTokenCount": 100,
            "totalTokenCount": 300,
        },
    }
    scenarios: list[dict[str, Any]] = []

    for accept_gray_zone in (False, True):
        channel_id, doc_id, criterion_id = await ensure_llm_cost_review_fixture()
        event_id = str(uuid.uuid4())
        expected_policy = "accept_gray_zone" if accept_gray_zone else "reject_gray_zone"
        expected_provider_decision = "approve" if accept_gray_zone else "reject"
        expected_criterion_decision = "relevant" if accept_gray_zone else "irrelevant"
        expected_system_decision = "eligible" if accept_gray_zone else "filtered_out"

        try:
            await insert_budget_exhaustion_review(
                doc_id=doc_id,
                criterion_id=criterion_id,
                cost_estimate_usd=Decimal("5.000000"),
            )
            review_count_before = await fetch_llm_review_count(doc_id)
            await ensure_outbox_event(
                event_id=event_id,
                event_type=LLM_REVIEW_REQUESTED_EVENT,
                aggregate_type="criterion",
                aggregate_id=criterion_id,
                payload={
                    "docId": doc_id,
                    "scope": "criterion",
                    "targetId": criterion_id,
                    "version": 1,
                },
            )

            with fake_gemini_server(fake_payload) as (base_url, request_paths):
                with temporary_environment(
                    {
                        "GEMINI_API_KEY": "local-budget-stop-proof-key",
                        "GEMINI_MODEL": "gemini-3.1-flash-lite",
                        "GEMINI_BASE_URL": base_url,
                        "LLM_REVIEW_ENABLED": "1",
                        "LLM_REVIEW_MONTHLY_BUDGET_CENTS": "100",
                        "LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE": "1"
                        if accept_gray_zone
                        else "0",
                    }
                ):
                    result = await process_llm_review(
                        FakeJob(
                            {
                                "eventId": event_id,
                                "docId": doc_id,
                                "scope": "criterion",
                                "targetId": criterion_id,
                            }
                        ),
                        "",
                    )

            review_count_after = await fetch_llm_review_count(doc_id)
            if review_count_after != review_count_before:
                raise RuntimeError(
                    "LLM budget stop smoke failed: runtime gate wrote a new llm_review_log row."
                )
            if request_paths:
                raise RuntimeError(
                    "LLM budget stop smoke failed: fake Gemini endpoint should not be called after hard stop."
                )
            if result.get("status") != "review-skipped-runtime-policy":
                raise RuntimeError(
                    "LLM budget stop smoke failed: queued review was not short-circuited by runtime policy."
                )
            if str(result.get("decision") or "") != expected_provider_decision:
                raise RuntimeError(
                    "LLM budget stop smoke failed: runtime policy returned an unexpected provider decision."
                )
            if str(result.get("runtimePolicyReason") or "") != "monthly_budget_exhausted":
                raise RuntimeError(
                    "LLM budget stop smoke failed: runtime policy reason did not report exhausted budget."
                )

            criterion_match = await fetch_criterion_match_result(doc_id, criterion_id)
            if criterion_match is None:
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion_match_results row is missing after runtime resolution."
                )
            if str(criterion_match.get("decision") or "") != expected_criterion_decision:
                raise RuntimeError(
                    "LLM budget stop smoke failed: gray-zone criterion did not resolve to the expected final decision."
                )
            criterion_explain = criterion_match.get("explain_json")
            if not isinstance(criterion_explain, dict):
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain_json did not stay structured."
                )
            llm_budget_gate = criterion_explain.get("llmBudgetGate")
            if not isinstance(llm_budget_gate, dict):
                raise RuntimeError(
                    "LLM budget stop smoke failed: llmBudgetGate explain block is missing on the criterion row."
                )
            if str(llm_budget_gate.get("reason") or "") != "monthly_budget_exhausted":
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain block did not record the hard-stop reason."
                )
            if str(llm_budget_gate.get("policy") or "") != expected_policy:
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain block did not preserve the configured policy."
                )
            if int(llm_budget_gate.get("budgetCents") or 0) != 100:
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain block did not preserve the configured budget."
                )

            system_feed = await fetch_system_feed_result(doc_id)
            verify_system_feed_result_consistency(system_feed, require_criteria_counts=True)
            if str((system_feed or {}).get("decision") or "") != expected_system_decision:
                raise RuntimeError(
                    "LLM budget stop smoke failed: system feed decision did not match the configured runtime policy."
                )
            if int((system_feed or {}).get("pending_llm_criteria_count") or 0) != 0:
                raise RuntimeError(
                    "LLM budget stop smoke failed: system feed still reports pending_llm after runtime resolution."
                )

            scenarios.append(
                {
                    "policy": expected_policy,
                    "docId": doc_id,
                    "criterionId": criterion_id,
                    "reviewCount": review_count_after,
                    "systemFeedDecision": expected_system_decision,
                    "result": result,
                }
            )
        finally:
            await cleanup_llm_cost_review_fixture(
                channel_id=channel_id,
                doc_id=doc_id,
                criterion_id=criterion_id,
                event_id=event_id,
            )

    return {
        "status": "llm-budget-stop-ok",
        "scenarios": scenarios,
    }


async def run_discovery_enabled_smoke() -> dict[str, Any]:
    fake_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '[{"source_url":"https://news.example.com/eu-ai","verdict":"review","relevance":0.93,"reasoning":"synthetic discovery vNext smoke"}]'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 240,
            "candidatesTokenCount": 80,
            "totalTokenCount": 320,
        },
    }
    discovered_model = os.getenv("DISCOVERY_GEMINI_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-3.5-flash"
    discovered_base_url = os.getenv("DISCOVERY_GEMINI_BASE_URL") or os.getenv("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
    discovered_input_cost = os.getenv("DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD") or os.getenv(
        "LLM_INPUT_COST_PER_MILLION_USD"
    ) or "1.50"
    discovered_output_cost = os.getenv("DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD") or os.getenv(
        "LLM_OUTPUT_COST_PER_MILLION_USD"
    ) or "9.00"

    with fake_gemini_server(fake_payload) as (base_url, request_paths):
        with fake_ddgs_client() as ddgs_calls:
            with temporary_environment(
                {
                    "DISCOVERY_ENABLED": "1",
                    "DISCOVERY_SEARCH_PROVIDER": "ddgs",
                    "DISCOVERY_DDGS_BACKEND": "auto",
                    "DISCOVERY_DDGS_REGION": "us-en",
                    "DISCOVERY_DDGS_SAFESEARCH": "moderate",
                    "DISCOVERY_GEMINI_API_KEY": "local-discovery-proof-key",
                    "DISCOVERY_GEMINI_MODEL": discovered_model,
                    "DISCOVERY_GEMINI_BASE_URL": base_url,
                    "DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD": discovered_input_cost,
                    "DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD": discovered_output_cost,
                    "DISCOVERY_MONTHLY_BUDGET_CENTS": "500",
                }
            ):
                try:
                    if not discovery_enabled():
                        raise RuntimeError("Discovery enabled smoke failed: DISCOVERY_ENABLED was not honored.")

                    configure_discovery_runtime(build_live_discovery_runtime())
                    runtime = get_discovery_runtime()
                    if runtime.web_search.__class__.__name__ != "DdgsWebSearchAdapter":
                        raise RuntimeError("Discovery enabled smoke failed: live DDGS adapter was not configured.")
                    if runtime.llm_analyzer.__class__.__name__ != "GeminiLlmAnalyzerAdapter":
                        raise RuntimeError("Discovery enabled smoke failed: live Gemini analyzer was not configured.")
                    search_provider = os.getenv("DISCOVERY_SEARCH_PROVIDER", "").strip()
                    monthly_budget_cents = int(os.getenv("DISCOVERY_MONTHLY_BUDGET_CENTS") or "0")
                    if search_provider != "ddgs":
                        raise RuntimeError("Discovery enabled smoke failed: discovery settings did not resolve DDGS.")
                    if monthly_budget_cents != 500:
                        raise RuntimeError("Discovery enabled smoke failed: monthly quota did not resolve to $5.00.")

                    search_result = await WebSearchPlugin().execute(
                        options={
                            "query": "EU AI news",
                            "count": 1,
                            "type": "news",
                            "time_range": "day",
                        },
                        context={},
                    )
                    if search_result["search_meta"].get("provider") != "ddgs":
                        raise RuntimeError("Discovery enabled smoke failed: search meta did not report DDGS.")
                    if search_result["search_meta"].get("result_type") != "news":
                        raise RuntimeError("Discovery enabled smoke failed: search meta did not preserve result type.")
                    if len(search_result["search_results"]) != 1:
                        raise RuntimeError("Discovery enabled smoke failed: expected one normalized DDGS result.")
                    if len(ddgs_calls) != 1 or ddgs_calls[0][0] != "news":
                        raise RuntimeError("Discovery enabled smoke failed: fake DDGS news search was not called once.")

                    llm_result = await LlmAnalyzerPlugin().execute(
                        options={
                            "task": "discovery_source_evaluation",
                            "payload": search_result["search_results"],
                            "output_field": "analysis",
                        },
                        context={},
                    )
                    llm_meta = llm_result["analysis_meta"]
                    if llm_meta.get("provider") != "gemini":
                        raise RuntimeError("Discovery enabled smoke failed: LLM meta did not report Gemini.")
                    if int(llm_meta.get("request_count") or 0) != 1:
                        raise RuntimeError("Discovery enabled smoke failed: discovery Gemini was not called exactly once.")
                    if Decimal(str(llm_meta.get("cost_usd") or "0")).quantize(Decimal("0.000001")) <= Decimal("0"):
                        raise RuntimeError("Discovery enabled smoke failed: LLM cost metadata was not recorded.")
                    if len(request_paths) != 1:
                        raise RuntimeError("Discovery enabled smoke failed: fake discovery Gemini endpoint was not called once.")

                    return {
                        "status": "discovery-enabled-ok",
                        "enabled": True,
                        "discoveryVNext": True,
                        "searchProvider": search_provider,
                        "llmModel": discovered_model,
                        "monthlyBudgetCents": monthly_budget_cents,
                        "searchMeta": search_result["search_meta"],
                        "llmMeta": llm_meta,
                        "ddgsCall": ddgs_calls[0],
                        "providerPath": request_paths[0],
                        "configuredBaseUrl": discovered_base_url,
                    }
                finally:
                    reset_discovery_runtime()
