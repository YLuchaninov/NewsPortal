from __future__ import annotations

from typing import Any

from fastapi import FastAPI


def register_discovery_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    app.get("/maintenance/discovery/summary")(deps["get_discovery_summary_route"])
    app.get("/maintenance/discovery/classes")(deps["list_discovery_classes"])
    app.post("/maintenance/discovery/classes", status_code=201)(
        deps["create_discovery_class_route"]
    )
    app.get("/maintenance/discovery/classes/{class_key}")(
        deps["get_discovery_class_route"]
    )
    app.patch("/maintenance/discovery/classes/{class_key}")(
        deps["update_discovery_class_route"]
    )
    app.delete("/maintenance/discovery/classes/{class_key}")(
        deps["delete_discovery_class_route"]
    )
    app.get("/maintenance/discovery/missions")(deps["list_discovery_missions"])
    app.post("/maintenance/discovery/missions", status_code=201)(
        deps["create_discovery_mission_route"]
    )
    app.get("/maintenance/discovery/missions/{mission_id}")(
        deps["get_discovery_mission_route"]
    )
    app.patch("/maintenance/discovery/missions/{mission_id}")(
        deps["update_discovery_mission_route"]
    )
    app.delete("/maintenance/discovery/missions/{mission_id}")(
        deps["delete_discovery_mission_route"]
    )
    app.post("/maintenance/discovery/missions/{mission_id}/compile-graph")(
        deps["compile_discovery_mission_graph_route"]
    )
    app.post("/maintenance/discovery/missions/{mission_id}/run", status_code=202)(
        deps["request_discovery_mission_run_route"]
    )
    app.get("/maintenance/discovery/missions/{mission_id}/portfolio")(
        deps["get_discovery_portfolio_snapshot_route"]
    )
    app.get("/maintenance/discovery/profiles")(deps["list_discovery_policy_profiles"])
    app.post("/maintenance/discovery/profiles", status_code=201)(
        deps["create_discovery_policy_profile_route"]
    )
    app.get("/maintenance/discovery/profiles/{profile_id}")(
        deps["get_discovery_policy_profile_route"]
    )
    app.patch("/maintenance/discovery/profiles/{profile_id}")(
        deps["update_discovery_policy_profile_route"]
    )
    app.delete("/maintenance/discovery/profiles/{profile_id}")(
        deps["delete_discovery_policy_profile_route"]
    )
    app.get("/maintenance/discovery/recall-missions")(
        deps["list_discovery_recall_missions"]
    )
    app.post("/maintenance/discovery/recall-missions", status_code=201)(
        deps["create_discovery_recall_mission_route"]
    )
    app.get("/maintenance/discovery/recall-missions/{recall_mission_id}")(
        deps["get_discovery_recall_mission_route"]
    )
    app.patch("/maintenance/discovery/recall-missions/{recall_mission_id}")(
        deps["update_discovery_recall_mission_route"]
    )
    app.post("/maintenance/discovery/recall-missions/{recall_mission_id}/acquire")(
        deps["request_discovery_recall_mission_acquisition_route"]
    )
    app.get("/maintenance/discovery/candidates")(deps["list_discovery_candidates"])
    app.get("/maintenance/discovery/candidates/{candidate_id}")(
        deps["get_discovery_candidate_route"]
    )
    app.patch("/maintenance/discovery/candidates/{candidate_id}")(
        deps["update_discovery_candidate_route"]
    )
    app.get("/maintenance/discovery/recall-candidates")(
        deps["list_discovery_recall_candidates"]
    )
    app.post("/maintenance/discovery/recall-candidates", status_code=201)(
        deps["create_discovery_recall_candidate_route"]
    )
    app.get("/maintenance/discovery/recall-candidates/{recall_candidate_id}")(
        deps["get_discovery_recall_candidate_route"]
    )
    app.post("/maintenance/discovery/recall-candidates/{recall_candidate_id}/promote")(
        deps["promote_discovery_recall_candidate_route"]
    )
    app.patch("/maintenance/discovery/recall-candidates/{recall_candidate_id}")(
        deps["update_discovery_recall_candidate_route"]
    )
    app.get("/maintenance/discovery/hypotheses")(deps["list_discovery_hypotheses"])
    app.get("/maintenance/discovery/hypotheses/{hypothesis_id}")(
        deps["get_discovery_hypothesis_route"]
    )
    app.get("/maintenance/discovery/source-profiles")(
        deps["list_discovery_source_profiles"]
    )
    app.get("/maintenance/discovery/source-profiles/{source_profile_id}")(
        deps["get_discovery_source_profile_route"]
    )
    app.get("/maintenance/discovery/source-quality-snapshots")(
        deps["list_discovery_source_quality_snapshots"]
    )
    app.get("/maintenance/discovery/source-quality-snapshots/{snapshot_id}")(
        deps["get_discovery_source_quality_snapshot_route"]
    )
    app.get("/maintenance/discovery/source-interest-scores")(
        deps["list_discovery_source_interest_scores"]
    )
    app.get("/maintenance/discovery/source-interest-scores/{score_id}")(
        deps["get_discovery_source_interest_score_route"]
    )
    app.get("/maintenance/discovery/feedback")(deps["list_discovery_feedback"])
    app.post("/maintenance/discovery/feedback", status_code=201)(
        deps["create_discovery_feedback_route"]
    )
    app.post("/maintenance/discovery/re-evaluate")(
        deps["re_evaluate_discovery_sources_route"]
    )
    app.get("/maintenance/discovery/costs/summary")(
        deps["get_discovery_cost_summary_route"]
    )
