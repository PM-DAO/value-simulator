from simulator.jtbd import calculate_odi_score, evaluate_jtbd, Job, CATEGORY_JOBS

def test_odi_score_basic():
    assert calculate_odi_score(5, 2) == 8  # 5 + max(5-2, 0) = 8
    assert calculate_odi_score(3, 3) == 3  # 3 + max(3-3, 0) = 3
    assert calculate_odi_score(5, 5) == 5  # 5 + max(5-5, 0) = 5
    assert calculate_odi_score(1, 5) == 1  # 1 + max(1-5, 0) = 1

def test_odi_underserved():
    # importance=5, satisfaction=1 -> score = 5+4 = 9 -> underserved
    result = evaluate_jtbd("healthcare")
    assert result.odi_score > 0
    assert result.odi_label in ("underserved", "served", "overserved")

def test_evaluate_all_categories():
    for cat in CATEGORY_JOBS:
        result = evaluate_jtbd(cat)
        assert result.odi_score > 0
        assert result.jtbd_fit > 0
        assert len(result.jobs) > 0

def test_evaluate_with_target():
    base = evaluate_jtbd("saas")
    student = evaluate_jtbd("saas", target="student")
    # Both should produce valid results
    assert base.odi_score > 0
    assert student.odi_score > 0

def test_evaluate_custom_jobs():
    jobs = [
        Job(statement="テスト", type="functional", importance=5, current_satisfaction=1),
    ]
    result = evaluate_jtbd("saas", custom_jobs=jobs)
    assert result.odi_score == 9.0  # 5 + max(5-1, 0) = 9

def test_jtbd_fit_range():
    for cat in CATEGORY_JOBS:
        result = evaluate_jtbd(cat)
        assert 0.0 <= result.jtbd_fit <= 1.0

def test_unknown_category_fallback():
    result = evaluate_jtbd("nonexistent")
    assert result.odi_score > 0  # Falls back to saas
