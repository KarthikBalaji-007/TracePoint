import json

import joblib
import numpy as np
import pytest

from ml.train_baseline import (
    ARTIFACT_DIR,
    DATA_DIR,
    FEATURE_LIST,
    NUMERIC_FEATURES,
    chronological_split,
    feature_matrix,
    fit_model_suite,
    load_dataset,
    score_example,
    train,
)


@pytest.fixture(scope="module")
def trained_report():
    return train(DATA_DIR, ARTIFACT_DIR, seed=42)


def test_chronological_split_has_no_time_leakage():
    examples, _, _ = load_dataset(DATA_DIR)
    train_rows, validation_rows, test_rows, information = chronological_split(examples)
    last_train = max(row["as_of"] for row in train_rows)
    first_validation = min(row["as_of"] for row in validation_rows)
    last_validation = max(row["as_of"] for row in validation_rows)
    first_test = min(row["as_of"] for row in test_rows)

    assert last_train < first_validation
    assert last_validation < first_test
    assert information["train"]["rows"] + information["validation"]["rows"] + information["test"]["rows"] == len(examples)


def test_preprocessing_is_fitted_only_on_training_rows():
    examples, _, _ = load_dataset(DATA_DIR)
    run = fit_model_suite(examples, seed=7)
    train_rows = run["train_rows"]
    x_train, _ = feature_matrix(train_rows)
    expected_means = np.asarray(x_train[:, :len(NUMERIC_FEATURES)], dtype=float).mean(axis=0)

    for preprocessor in run["preprocessors"].values():
        actual_means = preprocessor.named_transformers_["numeric"].mean_
        np.testing.assert_allclose(actual_means, expected_means)


def test_training_completes_successfully(trained_report):
    assert trained_report["dataset_rows"] > 0
    assert trained_report["selected_model"] in {
        "Logistic Regression", "Random Forest", "Gradient Boosting"
    }
    assert trained_report["metrics_label"] == "SYNTHETIC-ONLY"


def test_saved_artifacts_load(trained_report):
    model = joblib.load(ARTIFACT_DIR / "model.joblib")
    preprocessor = joblib.load(ARTIFACT_DIR / "preprocessor.joblib")
    metadata = json.loads((ARTIFACT_DIR / "model_metadata.json").read_text(encoding="utf-8"))
    feature_list = json.loads((ARTIFACT_DIR / "feature_list.json").read_text(encoding="utf-8"))

    assert hasattr(model, "predict_proba")
    assert hasattr(preprocessor, "transform")
    assert metadata["model_version"] == trained_report["model_version"]
    assert metadata["synthetic_only"] is True
    assert len(feature_list["numeric"] + feature_list["categorical"]) == len(FEATURE_LIST)


def test_inference_score_is_between_zero_and_one(trained_report):
    examples, _, _ = load_dataset(DATA_DIR)
    model = joblib.load(ARTIFACT_DIR / "model.joblib")
    preprocessor = joblib.load(ARTIFACT_DIR / "preprocessor.joblib")
    score = score_example(examples[-1], model, preprocessor)

    assert 0.0 <= score <= 1.0
