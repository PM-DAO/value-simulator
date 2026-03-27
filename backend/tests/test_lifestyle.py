"""Tests for lifestyle tag definitions and assignment."""

import random

from simulator.lifestyle import (
    LIFESTYLE_TAGS,
    ALL_TAG_IDS,
    TAG_HIERARCHY,
    TAG_GROUPS,
    assign_lifestyle_tags,
    build_compact_tag_prompt,
)


class TestTagDefinitions:
    """Tests for the tag pool structure."""

    def test_tag_count_in_range(self):
        """Total tags should be in the 300-500 range."""
        assert 300 <= len(ALL_TAG_IDS) <= 500, f"Got {len(ALL_TAG_IDS)} tags"

    def test_all_tags_have_required_fields(self):
        for tag_id, tag_def in LIFESTYLE_TAGS.items():
            assert tag_def.id == tag_id
            assert tag_def.group, f"{tag_id}: missing group"
            assert tag_def.subgroup, f"{tag_id}: missing subgroup"
            assert tag_def.label_ja, f"{tag_id}: missing label_ja"
            assert 0.0 <= tag_def.base_rate <= 1.0, f"{tag_id}: invalid base_rate"

    def test_twelve_groups_exist(self):
        expected_groups = {
            "pet", "vehicle", "digital", "health", "food", "finance",
            "housing", "hobby", "work_style", "life_stage", "social",
            "sustainability",
        }
        assert set(TAG_GROUPS.keys()) == expected_groups

    def test_each_group_has_substantial_tags(self):
        """Each group should have at least 19 tags."""
        for group, tags in TAG_GROUPS.items():
            assert len(tags) >= 19, f"Group '{group}' has only {len(tags)} tags"

    def test_no_duplicate_tag_ids(self):
        seen = set()
        for tag_id in ALL_TAG_IDS:
            assert tag_id not in seen, f"Duplicate tag ID: {tag_id}"
            seen.add(tag_id)

    def test_hierarchy_consistency(self):
        """TAG_HIERARCHY should contain all tags."""
        all_from_hierarchy = []
        for group, subgroups in TAG_HIERARCHY.items():
            for subgroup, tag_ids in subgroups.items():
                all_from_hierarchy.extend(tag_ids)
        assert set(all_from_hierarchy) == set(ALL_TAG_IDS)

    def test_modifier_keys_have_valid_dimensions(self):
        valid_dims = {"age_band", "gender", "region", "income_level", "household_type"}
        for tag_id, tag_def in LIFESTYLE_TAGS.items():
            for key in tag_def.modifiers:
                dim = key.split(":")[0]
                assert dim in valid_dims, f"{tag_id}: invalid modifier dimension '{dim}'"

    def test_forces_boost_keys_are_valid(self):
        from simulator.agent import Forces
        valid_fields = set(Forces.model_fields.keys())
        for tag_id, tag_def in LIFESTYLE_TAGS.items():
            for key in tag_def.forces_boost:
                assert key in valid_fields, f"{tag_id}: invalid forces_boost key '{key}'"


class TestTagAssignment:
    """Tests for assign_lifestyle_tags()."""

    def test_returns_list_of_strings(self):
        rng = random.Random(42)
        tags = assign_lifestyle_tags(
            age=30, gender="male", region="kanto",
            income_level="middle", household_type="single",
            rng=rng,
        )
        assert isinstance(tags, list)
        for t in tags:
            assert isinstance(t, str)
            assert t in LIFESTYLE_TAGS

    def test_deterministic_with_same_seed(self):
        kwargs = dict(age=35, gender="female", region="kansai",
                      income_level="high", household_type="couple")
        tags1 = assign_lifestyle_tags(**kwargs, rng=random.Random(123))
        tags2 = assign_lifestyle_tags(**kwargs, rng=random.Random(123))
        assert tags1 == tags2

    def test_different_seeds_produce_different_tags(self):
        kwargs = dict(age=35, gender="female", region="kansai",
                      income_level="high", household_type="couple")
        tags1 = assign_lifestyle_tags(**kwargs, rng=random.Random(1))
        tags2 = assign_lifestyle_tags(**kwargs, rng=random.Random(999))
        # Statistically nearly impossible to be identical with 400+ tags
        assert tags1 != tags2

    def test_agent_gets_reasonable_tag_count(self):
        """An agent should typically get 20-120 tags out of ~400."""
        rng = random.Random(42)
        counts = []
        for seed in range(50):
            tags = assign_lifestyle_tags(
                age=35, gender="male", region="kanto",
                income_level="middle", household_type="family_young",
                rng=random.Random(seed),
            )
            counts.append(len(tags))
        avg = sum(counts) / len(counts)
        assert 15 < avg < 150, f"Average tag count {avg} seems off"

    def test_modifiers_affect_distribution(self):
        """Pet tags should be more common for family_young households."""
        n = 500
        family_pet_count = 0
        single_pet_count = 0

        for seed in range(n):
            tags_family = assign_lifestyle_tags(
                age=35, gender="female", region="kanto",
                income_level="middle", household_type="family_young",
                rng=random.Random(seed),
            )
            tags_single = assign_lifestyle_tags(
                age=35, gender="female", region="kanto",
                income_level="middle", household_type="single",
                rng=random.Random(seed),
            )
            family_pet_count += sum(1 for t in tags_family if t.startswith("pet_"))
            single_pet_count += sum(1 for t in tags_single if t.startswith("pet_"))

        # Families should have noticeably more pet tags
        assert family_pet_count > single_pet_count * 1.1

    def test_young_agents_get_more_digital_tags(self):
        """Young agents should get more digital/social tags."""
        n = 500
        young_digital = 0
        senior_digital = 0

        for seed in range(n):
            tags_young = assign_lifestyle_tags(
                age=22, gender="male", region="kanto",
                income_level="middle", household_type="single",
                rng=random.Random(seed),
            )
            tags_senior = assign_lifestyle_tags(
                age=65, gender="male", region="kanto",
                income_level="middle", household_type="couple",
                rng=random.Random(seed),
            )
            young_digital += sum(1 for t in tags_young if t.startswith("sns_") or t.startswith("game_"))
            senior_digital += sum(1 for t in tags_senior if t.startswith("sns_") or t.startswith("game_"))

        assert young_digital > senior_digital * 1.3


class TestCompactPrompt:
    """Tests for LLM prompt generation."""

    def test_prompt_covers_all_groups(self):
        prompt = build_compact_tag_prompt()
        for group in TAG_GROUPS:
            assert f"[{group}]" in prompt

    def test_prompt_is_reasonable_length(self):
        prompt = build_compact_tag_prompt()
        # Should be under 15000 chars (~3500 tokens)
        assert len(prompt) < 15000, f"Prompt is {len(prompt)} chars"

    def test_prompt_contains_tag_ids(self):
        prompt = build_compact_tag_prompt()
        # Spot check some tag IDs
        assert "pet_dog_small" in prompt
        assert "car_kei" in prompt
        assert "sns_x_heavy" in prompt


class TestLifestyleTagMatching:
    """Tests for JTBD fit lifestyle tag integration."""

    def test_matching_tags_boost_fit(self):
        from simulator.jtbd import _apply_lifestyle_tag_multiplier

        base = 0.5
        agent_tags = ["pet_dog_small", "car_kei", "sns_x_heavy"]
        critical = [{"tag": "pet_dog_small", "weight": 0.9}]

        result = _apply_lifestyle_tag_multiplier(base, agent_tags, critical)
        assert result > base  # Should be boosted

    def test_non_matching_tags_reduce_fit(self):
        from simulator.jtbd import _apply_lifestyle_tag_multiplier

        base = 0.5
        agent_tags = ["car_kei", "sns_x_heavy"]
        critical = [{"tag": "pet_dog_small", "weight": 0.9}]

        result = _apply_lifestyle_tag_multiplier(base, agent_tags, critical)
        assert result < base  # Should be reduced

    def test_no_critical_tags_returns_unchanged(self):
        from simulator.jtbd import _apply_lifestyle_tag_multiplier

        base = 0.5
        agent_tags = ["pet_dog_small"]

        assert _apply_lifestyle_tag_multiplier(base, agent_tags, None) == base
        assert _apply_lifestyle_tag_multiplier(base, agent_tags, []) == base

    def test_match_ratio_affects_multiplier(self):
        from simulator.jtbd import _apply_lifestyle_tag_multiplier

        base = 0.5
        critical = [
            {"tag": "pet_dog_small", "weight": 0.5},
            {"tag": "pet_cat_indoor", "weight": 0.5},
        ]

        # Full match
        full = _apply_lifestyle_tag_multiplier(
            base, ["pet_dog_small", "pet_cat_indoor"], critical,
        )
        # Partial match
        partial = _apply_lifestyle_tag_multiplier(
            base, ["pet_dog_small"], critical,
        )
        # No match
        none = _apply_lifestyle_tag_multiplier(
            base, ["car_kei"], critical,
        )

        assert full > partial > none

    def test_fit_capped_at_one(self):
        from simulator.jtbd import _apply_lifestyle_tag_multiplier

        result = _apply_lifestyle_tag_multiplier(
            0.9, ["pet_dog_small"], [{"tag": "pet_dog_small", "weight": 1.0}],
        )
        assert result <= 1.0
