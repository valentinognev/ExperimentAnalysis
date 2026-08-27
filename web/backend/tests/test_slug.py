import pytest
from ea.slug import slugify


def test_slugify_baseball():
    assert slugify("Baseball") == "Baseball"
    assert slugify("flight 01") == "flight_01"


def test_slugify_rejects_empty():
    with pytest.raises(ValueError):
        slugify("***")
