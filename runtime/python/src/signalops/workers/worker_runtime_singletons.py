from __future__ import annotations

import logging

from signalops.indexer import InterestCentroidIndexer, load_indexer_config
from signalops.ml import (
    CriterionBaselineCompiler,
    HeuristicSignalCandidateFeatureExtractor,
    InterestBaselineCompiler,
    load_embedding_provider,
)

LOGGER = logging.getLogger("signalops.workers")

EMBEDDING_PROVIDER = load_embedding_provider()
FEATURE_EXTRACTOR = HeuristicSignalCandidateFeatureExtractor()
INTEREST_COMPILER = InterestBaselineCompiler()
CRITERION_COMPILER = CriterionBaselineCompiler()
INTEREST_INDEXER = InterestCentroidIndexer(load_indexer_config())
