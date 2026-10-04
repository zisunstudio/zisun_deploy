"""Decode a Canon HDR PQ frame that was saved as a plain JPEG (BT.2020 primaries,
ST 2084 curve, no profile) into ordinary sRGB.

1. ST 2084 (PQ) -> absolute light, scaled so reference white (203 nits, BT.2408) = 1.0
2. BT.2020 -> sRGB primaries (this is what removes the grey-green veil: read as
   sRGB, BT.2020 reds and skin tones lose saturation and drift green)
3. highlights above white rolled off smoothly instead of clipped
4. sRGB encoding
"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, colour
M = colour.matrix_RGB_to_RGB(colour.RGB_COLOURSPACES["ITU-R BT.2020"], colour.RGB_COLOURSPACES["sRGB"], None)

# The camera's own JPEGs render slightly warmer than a neutral decode. Measured on a
# grey road shot both ways minutes apart (IMG_9458 camera, IMG_9489 HDR): red x1.07.
# Without it skin sits ~5 degrees yellow-green of where the camera puts it.
WARM = np.array([1.07, 1.0, 1.0])

def decode(rgb8, white_nits=203.0, exposure=1.0):
    v = np.asarray(rgb8, dtype=np.float64) / 255.0
    lin = colour.models.eotf_ST2084(v) / white_nits * exposure
    lin = np.einsum("ij,...j->...i", M, lin)
    lin = np.clip(lin, 0, None) * WARM
    # soft shoulder on luminance above 0.8, colour ratios kept
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    k = 0.8
    Yt = np.where(Y > k, k + (1 - k) * np.tanh((Y - k) / (1 - k)), Y)
    lin = lin * (Yt / np.maximum(Y, 1e-9))[..., None]
    return np.clip(colour.models.eotf_inverse_sRGB(np.clip(lin, 0, 1)), 0, 1)
