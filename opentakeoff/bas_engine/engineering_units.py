"""Exact, dimensioned engineering quantities. No display rounding in decisions.

International inch/foot and pound-force definitions: NIST SP 811 Appendix B.
Power W and VA deliberately have DIFFERENT dimensions; PF is a separate input.
"""
from __future__ import annotations

from fractions import Fraction
from collections.abc import Iterable
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from .models import Contract

DecimalText = Annotated[str, Field(strict=True, pattern=r"^-?(0|[1-9][0-9]{0,19})(\.[0-9]{1,18})?$", max_length=40)]
Unit = Literal["V", "mV", "A", "mA", "ohm", "kohm", "W", "kW", "VA", "kVA",
               "N*m", "lbf*in", "lbf*ft", "Pa", "kPa", "psi", "degC", "degF",
               "Hz", "kHz", "s", "ms", "ratio"]

_INCH = Fraction("0.0254")
_LBF = Fraction("0.45359237") * Fraction("9.80665")
# dimension, multiplicative factor, additive offset in the canonical unit
UNITS: dict[str, tuple[str, Fraction, Fraction]] = {
    "V": ("voltage", Fraction(1), Fraction(0)),
    "mV": ("voltage", Fraction(1, 1000), Fraction(0)),
    "A": ("current", Fraction(1), Fraction(0)),
    "mA": ("current", Fraction(1, 1000), Fraction(0)),
    "ohm": ("resistance", Fraction(1), Fraction(0)),
    "kohm": ("resistance", Fraction(1000), Fraction(0)),
    "W": ("real_power", Fraction(1), Fraction(0)),
    "kW": ("real_power", Fraction(1000), Fraction(0)),
    "VA": ("apparent_power", Fraction(1), Fraction(0)),
    "kVA": ("apparent_power", Fraction(1000), Fraction(0)),
    "N*m": ("torque", Fraction(1), Fraction(0)),
    "lbf*in": ("torque", _LBF * _INCH, Fraction(0)),
    "lbf*ft": ("torque", _LBF * _INCH * 12, Fraction(0)),
    "Pa": ("pressure", Fraction(1), Fraction(0)),
    "kPa": ("pressure", Fraction(1000), Fraction(0)),
    "psi": ("pressure", _LBF / _INCH**2, Fraction(0)),
    "degC": ("temperature", Fraction(1), Fraction(0)),
    "degF": ("temperature", Fraction(5, 9), Fraction(-160, 9)),
    "Hz": ("frequency", Fraction(1), Fraction(0)),
    "kHz": ("frequency", Fraction(1000), Fraction(0)),
    "s": ("time", Fraction(1), Fraction(0)),
    "ms": ("time", Fraction(1, 1000), Fraction(0)),
    "ratio": ("ratio", Fraction(1), Fraction(0)),
}


class Quantity(Contract):
    value: DecimalText
    unit: Unit

    @property
    def dimension(self) -> str:
        return UNITS[self.unit][0]

    def exact(self) -> Fraction:
        _, factor, offset = UNITS[self.unit]
        return Fraction(self.value) * factor + offset


class Interval(Contract):
    minimum: Quantity
    maximum: Quantity

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.minimum.dimension != self.maximum.dimension:
            raise ValueError("interval endpoints must have the same dimension")
        if self.minimum.exact() > self.maximum.exact():
            raise ValueError("interval endpoints must be ordered")
        return self

    @property
    def dimension(self) -> str:
        return self.minimum.dimension


def require_dimension(value: Quantity | Interval, dimension: str, *, nonnegative: bool = True) -> None:
    if value.dimension != dimension:
        raise ValueError(f"expected {dimension} quantity")
    minimum = value.minimum if isinstance(value, Interval) else value
    if nonnegative and minimum.exact() < 0:
        raise ValueError(f"{dimension} value must be nonnegative")


def rational_text(value: Fraction) -> str:
    """Auditable normalized result; no binary float and no truncated decimal."""
    bounded_exact(value)
    return str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"


def bounded_exact(value: Fraction) -> Fraction:
    # Coprime per-load power factors can grow a rational denominator far beyond
    # the input byte size. Refuse excessive exact work, never round-to-pass or
    # depend on Python's machine-specific integer-to-string limit.
    if value.numerator.bit_length() > 8192 or value.denominator.bit_length() > 8192:
        raise ValueError("Declared engineering arithmetic exceeds the exact rational complexity limit")
    return value


def exact_sum(values: Iterable[Fraction]) -> Fraction:
    total = Fraction(0)
    for value in values:
        total = bounded_exact(total + value)
    return total
