"""Canonical non-learned input preparation for OpenTakeoff's DINOv2 symbol model."""

from __future__ import annotations

from PIL import Image, ImageOps


def prepare_symbol_image(image: Image.Image, size: int = 280) -> Image.Image:
    """Aspect-preserving 280px grayscale drawing crop replicated to RGB.

    DINOv2 expects three channels, but engineering symbol ink is fundamentally
    grayscale.  Keeping the channels identical removes accidental colour from
    mixed-source exports while preserving line geometry.  If an augmentation
    needs to change crop geometry, apply it before this final aspect-preserving
    preparation; never let it silently alter the 280×280 output contract.
    """
    if size < 1:
        raise ValueError("size must be positive")
    grayscale = ImageOps.grayscale(image)
    fitted = ImageOps.contain(grayscale, (size, size), method=Image.Resampling.LANCZOS)
    canvas = Image.new("L", (size, size), 255)
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas.convert("RGB")
