"""Train and evaluate a reproducible synthetic-only historical baseline."""

import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.preprocessing import OneHotEncoder, StandardScaler

if __package__:
    from .generate_synthetic import (
        AMOUNT_BANDS,
        CATEGORIES,
        CHANNELS,
        FEATURE_FIELDS,
        HORIZONS,
        parse_timestamp,
        validate_training_examples,
    )
else:
    from generate_synthetic import (
        AMOUNT_BANDS,
        CATEGORIES,
        CHANNELS,
        FEATURE_FIELDS,
        HORIZONS,
        parse_timestamp,
        validate_training_examples,
    )


TARGET_FIELD = "target_cashout_in_window"
NUMERIC_FEATURES = [
    "recent_event_count_24h",
    "distinct_event_count_24h",
    "recent_cashout_count_24h",
    "cash_point_density",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "sin_hour",
    "cos_hour",
    "sin_day",
    "cos_day",
    *[f"amount_band_count_24h_{band}" for band in AMOUNT_BANDS],
    *[f"channel_count_24h_{channel}" for channel in CHANNELS],
    *[f"category_count_24h_{category}" for category in CATEGORIES],
]
CATEGORICAL_FEATURES = ["zone_id", "horizon"]
FEATURE_LIST = NUMERIC_FEATURES + CATEGORICAL_FEATURES
MODEL_ORDER = ("Logistic Regression", "Random Forest", "Gradient Boosting")
REVIEW_FRACTION = 0.05
MODEL_VERSION_PREFIX = "tracepoint-historical-baseline-v1"
DATA_DIR = Path(__file__).resolve().parent / "data"
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"


def load_dataset(data_dir: Path) -> tuple[list[dict], list[dict], str]:
    examples_path = data_dir / "training_examples.jsonl"
    events_path = data_dir / "events.jsonl"
    examples = [json.loads(line) for line in examples_path.read_text(encoding="utf-8").splitlines() if line]
    events = [json.loads(line) for line in events_path.read_text(encoding="utf-8").splitlines() if line]
    validate_training_examples(examples, events)
    if not examples:
        raise ValueError("training_examples.jsonl contains no rows")
    if any(event.get("provenance") not in {"REAL_AUTHORIZED", "SYNTHETIC", "MANUAL_DEMO"} for event in events):
        raise ValueError("event has missing or unsupported provenance")
    if any(example.get("provenance") not in {"REAL_AUTHORIZED", "SYNTHETIC", "MANUAL_DEMO"} for example in examples):
        raise ValueError("training example has missing or unsupported provenance")
    for example in examples:
        horizon = example.get("horizon")
        if horizon not in HORIZONS or example.get("horizon_hours") != HORIZONS[horizon]:
            raise ValueError(f"unsupported horizon in {example.get('example_id', 'unknown example')}")
        expected_end = parse_timestamp(example["as_of"]).timestamp() + HORIZONS[horizon] * 3600
        if parse_timestamp(example["label_window_end"]).timestamp() != expected_end:
            raise ValueError(f"label window does not match horizon in {example['example_id']}")
        if example.get(TARGET_FIELD) not in (0, 1):
            raise ValueError(f"target must be binary in {example['example_id']}")
    dataset_digest = hashlib.sha256(examples_path.read_bytes()).hexdigest()
    return examples, events, dataset_digest


def chronological_split(examples: list[dict]) -> tuple[list[dict], list[dict], list[dict], dict]:
    """Split by cutoff groups so a single as_of never crosses partitions."""
    ordered = sorted(
        examples,
        key=lambda row: (
            parse_timestamp(row["as_of"]),
            row["zone_id"],
            row["horizon_hours"],
            row["example_id"],
        ),
    )
    cutoffs = sorted({row["as_of"] for row in ordered}, key=parse_timestamp)
    if len(cutoffs) < 3:
        raise ValueError("at least three distinct as_of cutoffs are required for chronological splits")

    train_end = max(1, int(len(cutoffs) * 0.60))
    validation_end = max(train_end + 1, int(len(cutoffs) * 0.80))
    validation_end = min(validation_end, len(cutoffs) - 1)
    train_cutoffs = set(cutoffs[:train_end])
    validation_cutoffs = set(cutoffs[train_end:validation_end])
    test_cutoffs = set(cutoffs[validation_end:])
    splits = {
        "train": [row for row in ordered if row["as_of"] in train_cutoffs],
        "validation": [row for row in ordered if row["as_of"] in validation_cutoffs],
        "test": [row for row in ordered if row["as_of"] in test_cutoffs],
    }
    if any(not rows for rows in splits.values()):
        raise ValueError("chronological split produced an empty partition")

    information = {}
    for name, rows in splits.items():
        row_cutoffs = [row["as_of"] for row in rows]
        information[name] = {
            "rows": len(rows),
            "distinct_cutoffs": len(set(row_cutoffs)),
            "first_as_of": min(row_cutoffs, key=parse_timestamp),
            "last_as_of": max(row_cutoffs, key=parse_timestamp),
            "positive_targets": sum(int(row[TARGET_FIELD]) for row in rows),
        }
    information["method"] = "chronological by unique as_of; 60% train, 20% validation, 20% final test"
    return splits["train"], splits["validation"], splits["test"], information


def _feature_values(example: dict) -> list:
    features = example["features"]
    if set(features) != FEATURE_FIELDS:
        raise ValueError(f"feature contract mismatch in {example.get('example_id', 'unknown example')}")
    values = [
        features[name]
        for name in (
            "recent_event_count_24h",
            "distinct_event_count_24h",
            "recent_cashout_count_24h",
            "cash_point_density",
            "hour_of_day",
            "day_of_week",
            "is_weekend",
            "sin_hour",
            "cos_hour",
            "sin_day",
            "cos_day",
        )
    ]
    values.extend(features["amount_band_counts_24h"][band] for band in AMOUNT_BANDS)
    values.extend(features["channel_counts_24h"][channel] for channel in CHANNELS)
    values.extend(features["category_counts_24h"][category] for category in CATEGORIES)
    values.extend((example["zone_id"], example["horizon"]))
    return values


def feature_matrix(examples: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    matrix = np.asarray([_feature_values(example) for example in examples], dtype=object)
    target = np.asarray([int(example[TARGET_FIELD]) for example in examples], dtype=int)
    if not set(np.unique(target)).issubset({0, 1}):
        raise ValueError(f"{TARGET_FIELD} must be binary")
    return matrix, target


def make_preprocessor() -> ColumnTransformer:
    numeric_indexes = list(range(len(NUMERIC_FEATURES)))
    categorical_indexes = list(range(len(NUMERIC_FEATURES), len(FEATURE_LIST)))
    return ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), numeric_indexes),
            ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical_indexes),
        ],
        verbose_feature_names_out=True,
    )


def make_models(seed: int) -> dict:
    return {
        "Logistic Regression": LogisticRegression(
            max_iter=1000,
            class_weight="balanced",
            random_state=seed,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=120,
            max_depth=8,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            random_state=seed,
            n_jobs=1,
        ),
        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.05,
            max_depth=2,
            random_state=seed,
        ),
    }


def _optional_metric(metric, target, scores):
    if len(np.unique(target)) < 2:
        return None
    return round(float(metric(target, scores)), 6)


def evaluate_scores(target: np.ndarray, scores: np.ndarray) -> dict:
    predictions = (scores >= 0.5).astype(int)
    count = len(target)
    k = max(1, math.ceil(count * REVIEW_FRACTION))
    ranked_indexes = sorted(range(count), key=lambda index: (-float(scores[index]), index))[:k]
    positives = int(target.sum())
    positives_at_k = int(target[ranked_indexes].sum())
    return {
        "rows": count,
        "positive_targets": positives,
        "roc_auc": _optional_metric(roc_auc_score, target, scores),
        "precision_at_0_5": round(float(precision_score(target, predictions, zero_division=0)), 6),
        "recall_at_0_5": round(float(recall_score(target, predictions, zero_division=0)), 6),
        "f1_at_0_5": round(float(f1_score(target, predictions, zero_division=0)), 6),
        "pr_auc_average_precision": _optional_metric(average_precision_score, target, scores),
        "review_capacity_fraction": REVIEW_FRACTION,
        "review_capacity_k": k,
        "precision_at_k": round(positives_at_k / k, 6),
        "recall_at_k": round(positives_at_k / positives, 6) if positives else None,
        "score_threshold_note": "0.5 is a raw-score reporting threshold; scores are not calibrated probabilities",
    }


def _importance_for(model, preprocessor) -> list[dict]:
    names = preprocessor.get_feature_names_out().tolist()
    if hasattr(model, "feature_importances_"):
        values = np.asarray(model.feature_importances_, dtype=float)
        basis = "tree impurity importance"
        signed_values = None
    elif hasattr(model, "coef_"):
        signed_values = np.asarray(model.coef_[0], dtype=float)
        values = np.abs(signed_values)
        basis = "absolute logistic coefficient on standardized/one-hot feature"
    else:
        return []
    total = float(values.sum())
    if total:
        values = values / total
    importance = []
    for index, (name, value) in enumerate(zip(names, values)):
        item = {
            "feature": name,
            "importance": round(float(value), 8),
            "basis": basis,
        }
        if signed_values is not None:
            item["coefficient"] = round(float(signed_values[index]), 8)
        importance.append(item)
    return sorted(importance, key=lambda item: (-item["importance"], item["feature"]))


def fit_model_suite(examples: list[dict], seed: int = 42) -> dict:
    train_rows, validation_rows, test_rows, split_info = chronological_split(examples)
    x_train, y_train = feature_matrix(train_rows)
    x_validation, y_validation = feature_matrix(validation_rows)
    x_test, y_test = feature_matrix(test_rows)
    if len(np.unique(y_train)) < 2:
        raise ValueError("training partition must contain both target classes")

    models = {}
    preprocessors = {}
    metrics = {"validation": {}, "test": {}}
    for name, model in make_models(seed).items():
        preprocessor = make_preprocessor()
        # Fit preprocessing only from the chronological training partition.
        x_train_transformed = preprocessor.fit_transform(x_train)
        model.fit(x_train_transformed, y_train)
        models[name] = model
        preprocessors[name] = preprocessor
        x_validation_transformed = preprocessor.transform(x_validation)
        x_test_transformed = preprocessor.transform(x_test)
        metrics["validation"][name] = evaluate_scores(
            y_validation, model.predict_proba(x_validation_transformed)[:, 1]
        )
        metrics["test"][name] = evaluate_scores(
            y_test, model.predict_proba(x_test_transformed)[:, 1]
        )

    # Validation-only selection; ties resolve to PR-AUC, ROC-AUC, then fixed model order.
    def rank_metric(value):
        return -1.0 if value is None else value

    selected_name = max(
        MODEL_ORDER,
        key=lambda name: (
            metrics["validation"][name]["precision_at_k"],
            rank_metric(metrics["validation"][name]["pr_auc_average_precision"]),
            rank_metric(metrics["validation"][name]["roc_auc"]),
            -MODEL_ORDER.index(name),
        ),
    )
    selected_model = models[selected_name]
    selected_preprocessor = preprocessors[selected_name]
    return {
        "selected_name": selected_name,
        "model": selected_model,
        "preprocessor": selected_preprocessor,
        "models": models,
        "preprocessors": preprocessors,
        "metrics": metrics,
        "split_information": split_info,
        "feature_importance": _importance_for(selected_model, selected_preprocessor),
        "train_rows": train_rows,
        "validation_rows": validation_rows,
        "test_rows": test_rows,
    }


def score_example(example: dict, model, preprocessor) -> float:
    """Return the model's raw positive-class score, not a calibrated probability."""
    row = np.asarray([_feature_values(example)], dtype=object)
    transformed = preprocessor.transform(row)
    return float(model.predict_proba(transformed)[0, 1])


def _target_distribution(examples: list[dict]) -> dict:
    counts = Counter(int(example[TARGET_FIELD]) for example in examples)
    return {"0": counts.get(0, 0), "1": counts.get(1, 0)}


def _write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def train(data_dir: Path, output_dir: Path, seed: int = 42) -> dict:
    examples, events, dataset_digest = load_dataset(data_dir)
    zones = json.loads((data_dir / "zones.json").read_text(encoding="utf-8"))
    if any(zone.get("source_class") not in {"REAL_AUTHORIZED", "SYNTHETIC", "MANUAL_DEMO"} for zone in zones):
        raise ValueError("zone has missing or unsupported provenance")
    run = fit_model_suite(examples, seed)
    selected = run["selected_name"]
    model_version = f"{MODEL_VERSION_PREFIX}-seed{seed}-{dataset_digest[:12]}"
    provenance = sorted(
        {item["provenance"] for item in examples}
        | {item["provenance"] for item in events}
        | {item["source_class"] for item in zones}
    )
    synthetic_only = provenance == ["SYNTHETIC"]
    if synthetic_only:
        metric_label = "SYNTHETIC-ONLY"
    else:
        metric_label = "MIXED-PROVENANCE"

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(run["model"], output_dir / "model.joblib", compress=3)
    joblib.dump(run["preprocessor"], output_dir / "preprocessor.joblib", compress=3)
    _write_json(
        output_dir / "feature_list.json",
        {
            "numeric": NUMERIC_FEATURES,
            "categorical": CATEGORICAL_FEATURES,
            "target_excluded": [TARGET_FIELD, "target_event_refs", "label_window_start", "label_window_end"],
            "timestamp_metadata_excluded": [
                "as_of", "feature_event_refs", "feature_event_times", "feature_received_times",
                "latest_feature_event_time", "latest_feature_available_at",
            ],
        },
    )
    _write_json(
        output_dir / "evaluation.json",
        {
            "metrics_label": metric_label,
            "note": "Synthetic results are development signals, not operational accuracy.",
            "selection_split": "validation",
            "models": run["metrics"],
        },
    )
    _write_json(output_dir / "feature_importance.json", run["feature_importance"])
    metadata = {
        "model_version": model_version,
        "selected_model": selected,
        "selection_rule": (
            "Highest validation precision_at_k with k=ceil(5% of validation rows); "
            "ties break by average precision, ROC-AUC, then fixed order: Logistic Regression, "
            "Random Forest, Gradient Boosting. Final test metrics do not select the model."
        ),
        "target": {
            "field": TARGET_FIELD,
            "definition": "1 when a CASHOUT_OBSERVED event occurs for the zone in (as_of, as_of + horizon_hours]; otherwise 0.",
            "horizons": HORIZONS,
        },
        "score_semantics": "UNCALIBRATED_RAW_MODEL_SCORE",
        "calibration": {"performed": False, "reason": "No calibration method was fitted and validated."},
        "metrics_label": metric_label,
        "synthetic_only": synthetic_only,
        "training_data_provenance": provenance,
        "training_data": {
            "examples": len(examples),
            "events": len(events),
            "zones": len(zones),
            "sha256_training_examples": dataset_digest,
            "target_distribution": _target_distribution(examples),
        },
        "random_seed": seed,
        "split_information": run["split_information"],
        "feature_list": FEATURE_LIST,
        "feature_contract_source": "ml.generate_synthetic.FEATURE_FIELDS; explicit flattened allowlist",
        "preprocessing_fit_partition": "train only",
        "evaluation": run["metrics"],
        "feature_importance_file": "feature_importance.json",
        "feature_importance_basis": run["feature_importance"][0]["basis"] if run["feature_importance"] else None,
    }
    _write_json(output_dir / "model_metadata.json", metadata)

    report = {
        "dataset_rows": len(examples),
        "target_distribution": _target_distribution(examples),
        "split_information": run["split_information"],
        "metrics": run["metrics"],
        "selected_model": selected,
        "metrics_label": metric_label,
        "output_dir": str(output_dir),
        "model_version": model_version,
    }
    return report


def print_report(report: dict) -> None:
    print(f"Dataset: {report['dataset_rows']} historical examples; target counts {report['target_distribution']}")
    split_summary = ", ".join(
        "{}={}".format(name, info["rows"])
        for name, info in report["split_information"].items()
        if isinstance(info, dict)
    )
    print(f"Splits: {split_summary}")
    print(f"Metrics label: {report['metrics_label']} (not operational accuracy)")
    print("Model metrics: split/model ROC-AUC | precision | recall | F1 | PR-AUC | P@5% | R@5%")
    for split in ("validation", "test"):
        for name in MODEL_ORDER:
            metric = report["metrics"][split][name]
            values = (
                metric["roc_auc"], metric["precision_at_0_5"], metric["recall_at_0_5"],
                metric["f1_at_0_5"], metric["pr_auc_average_precision"],
                metric["precision_at_k"], metric["recall_at_k"],
            )
            display = " | ".join("n/a" if value is None else f"{value:.3f}" for value in values)
            print(f"  {split:10s} {name:20s} {display}")
    print(f"Selected model: {report['selected_model']} (validation-only deterministic rule)")
    print(f"Model version: {report['model_version']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=ARTIFACT_DIR)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    print_report(train(args.data_dir, args.output_dir, args.seed))


if __name__ == "__main__":
    main()
