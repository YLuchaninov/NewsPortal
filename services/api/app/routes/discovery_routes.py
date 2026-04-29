from __future__ import annotations

from typing import Any

from fastapi import APIRouter, FastAPI


def register_discovery_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/maintenance/discovery/summary")(deps["get_discovery_summary_route"])
    router.get("/maintenance/discovery/classes")(deps["list_discovery_classes"])
    router.post("/maintenance/discovery/classes", status_code=201)(
        deps["create_discovery_class_route"]
    )
    router.get("/maintenance/discovery/classes/{class_key}")(
        deps["get_discovery_class_route"]
    )
    router.patch("/maintenance/discovery/classes/{class_key}")(
        deps["update_discovery_class_route"]
    )
    router.delete("/maintenance/discovery/classes/{class_key}")(
        deps["delete_discovery_class_route"]
    )
    router.get("/maintenance/discovery/missions")(deps["list_discovery_missions"])
    router.post("/maintenance/discovery/missions", status_code=201)(
        deps["create_discovery_mission_route"]
    )
    router.get("/maintenance/discovery/missions/{mission_id}")(
        deps["get_discovery_mission_route"]
    )
    router.patch("/maintenance/discovery/missions/{mission_id}")(
        deps["update_discovery_mission_route"]
    )
    router.delete("/maintenance/discovery/missions/{mission_id}")(
        deps["delete_discovery_mission_route"]
    )
    router.post("/maintenance/discovery/missions/{mission_id}/compile-graph")(
        deps["compile_discovery_mission_graph_route"]
    )
    router.post("/maintenance/discovery/missions/{mission_id}/run", status_code=202)(
        deps["request_discovery_mission_run_route"]
    )
    router.get("/maintenance/discovery/missions/{mission_id}/portfolio")(
        deps["get_discovery_portfolio_snapshot_route"]
    )
    router.get("/maintenance/discovery/profiles")(deps["list_discovery_policy_profiles"])
    router.post("/maintenance/discovery/profiles", status_code=201)(
        deps["create_discovery_policy_profile_route"]
    )
    router.get("/maintenance/discovery/profiles/{profile_id}")(
        deps["get_discovery_policy_profile_route"]
    )
    router.patch("/maintenance/discovery/profiles/{profile_id}")(
        deps["update_discovery_policy_profile_route"]
    )
    router.delete("/maintenance/discovery/profiles/{profile_id}")(
        deps["delete_discovery_policy_profile_route"]
    )
    router.get("/maintenance/discovery/recall-missions")(
        deps["list_discovery_recall_missions"]
    )
    router.post("/maintenance/discovery/recall-missions", status_code=201)(
        deps["create_discovery_recall_mission_route"]
    )
    router.get("/maintenance/discovery/recall-missions/{recall_mission_id}")(
        deps["get_discovery_recall_mission_route"]
    )
    router.patch("/maintenance/discovery/recall-missions/{recall_mission_id}")(
        deps["update_discovery_recall_mission_route"]
    )
    router.post("/maintenance/discovery/recall-missions/{recall_mission_id}/acquire")(
        deps["request_discovery_recall_mission_acquisition_route"]
    )
    router.get("/maintenance/discovery/candidates")(deps["list_discovery_candidates"])
    router.get("/maintenance/discovery/candidates/{candidate_id}")(
        deps["get_discovery_candidate_route"]
    )
    router.patch("/maintenance/discovery/candidates/{candidate_id}")(
        deps["update_discovery_candidate_route"]
    )
    router.get("/maintenance/discovery/recall-candidates")(
        deps["list_discovery_recall_candidates"]
    )
    router.post("/maintenance/discovery/recall-candidates", status_code=201)(
        deps["create_discovery_recall_candidate_route"]
    )
    router.get("/maintenance/discovery/recall-candidates/{recall_candidate_id}")(
        deps["get_discovery_recall_candidate_route"]
    )
    router.post("/maintenance/discovery/recall-candidates/{recall_candidate_id}/promote")(
        deps["promote_discovery_recall_candidate_route"]
    )
    router.patch("/maintenance/discovery/recall-candidates/{recall_candidate_id}")(
        deps["update_discovery_recall_candidate_route"]
    )
    router.get("/maintenance/discovery/hypotheses")(deps["list_discovery_hypotheses"])
    router.get("/maintenance/discovery/hypotheses/{hypothesis_id}")(
        deps["get_discovery_hypothesis_route"]
    )
    router.get("/maintenance/discovery/source-profiles")(
        deps["list_discovery_source_profiles"]
    )
    router.get("/maintenance/discovery/source-profiles/{source_profile_id}")(
        deps["get_discovery_source_profile_route"]
    )
    router.get("/maintenance/discovery/source-quality-snapshots")(
        deps["list_discovery_source_quality_snapshots"]
    )
    router.get("/maintenance/discovery/source-quality-snapshots/{snapshot_id}")(
        deps["get_discovery_source_quality_snapshot_route"]
    )
    router.get("/maintenance/discovery/source-interest-scores")(
        deps["list_discovery_source_interest_scores"]
    )
    router.get("/maintenance/discovery/source-interest-scores/{score_id}")(
        deps["get_discovery_source_interest_score_route"]
    )
    router.get("/maintenance/discovery/feedback")(deps["list_discovery_feedback"])
    router.post("/maintenance/discovery/feedback", status_code=201)(
        deps["create_discovery_feedback_route"]
    )
    router.post("/maintenance/discovery/re-evaluate")(
        deps["re_evaluate_discovery_sources_route"]
    )
    router.get("/maintenance/discovery/costs/summary")(
        deps["get_discovery_cost_summary_route"]
    )
    app.include_router(router)
