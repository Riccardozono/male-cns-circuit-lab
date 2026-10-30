"""Private 520-signal learner; trained only on observed neural self-experience."""
import numpy as np
import torch
from torch import nn


DIMENSION = 520


def fit_basis(observations, centers=96):
    samples = np.asarray(observations, dtype=np.float64)
    if samples.ndim != 2 or samples.shape[1] != DIMENSION or not np.isfinite(samples).all():
        raise ValueError("Actual normalized 520-signal neural observations required")
    if not 8 <= centers <= 256 or len(samples) < centers:
        raise ValueError("Insufficient observations for bounded neural basis")
    selected = [0]
    nearest = ((samples - samples[0]) ** 2).mean(1)
    for _ in range(1, centers):
        j = int(np.argmax(nearest))
        if nearest[j] < 1e-12:
            raise ValueError("Insufficient distinct neural contexts")
        selected.append(j)
        nearest = np.minimum(nearest, ((samples - samples[j]) ** 2).mean(1))
    prototypes = samples[selected]
    distances = np.empty((len(samples), centers), dtype=np.float64)
    for j, center in enumerate(prototypes):
        distances[:, j] = np.sqrt(np.maximum(0, ((samples - center) ** 2).mean(1)))
    assignment = distances.argmin(1)
    pairwise = np.empty((centers, centers), dtype=np.float64)
    for j, center in enumerate(prototypes):
        pairwise[j] = np.sqrt(np.maximum(0, ((prototypes - center) ** 2).mean(1)))
    np.fill_diagonal(pairwise, np.inf)
    radii = [max(float(distances[assignment == j, j].max()) * 1.25,
                 float(pairwise[j].min()) * .6, 1e-5) for j in range(centers)]
    return {"format": "actual-neural-compact-basis-v2", "dimension": DIMENSION,
            "centers": prototypes.tolist(), "radii": radii, "samples": len(samples),
            "centerCount": centers,
            "algorithm": "Farthest actual neural samples and local Voronoi cover; no action, route, position or time labels"}


def fit_consolidation(reference):
    samples = np.asarray(reference, dtype=np.float32)
    if samples.ndim != 2 or samples.shape[1] != DIMENSION or len(samples) < 100 or not np.isfinite(samples).all():
        raise ValueError("Full actual 520-signal neural experience required")
    wide = samples.astype(np.float64)
    center = wide.mean(0)
    covariance = (wide - center).T @ (wide - center) / len(wide)
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    if not np.isfinite(eigenvalues).all():
        raise ValueError("Non-finite neural covariance")
    projection = eigenvectors[:, -64:].astype(np.float32)
    adjacent = np.sqrt(np.mean(np.diff(wide, axis=0) ** 2, axis=1))
    bandwidth = max(.003, float(np.median(adjacent)) * 2.)
    return {"format": "actual-neural-self-consolidation-v2", "dimension": DIMENSION,
            "projection": projection.tolist(), "center": center.astype(np.float32).tolist(),
            "bandwidth": bandwidth, "exactRetentionDeadband": 3e-5, "nearestCandidates": 16,
            "rows": len(samples),
            "boundary": "Unsupervised density of actual successful-lap neural states and current motor intention. No target-action labels, route positions or inference-time lap/time condition."}


class NeuralConsolidation(nn.Module):
    def __init__(self, reference, configuration):
        super().__init__()
        if configuration.get("dimension") != DIMENSION:
            raise ValueError("520-signal consolidation required; 518-signal data cannot be padded or reused")
        self.configuration = configuration
        self.register_buffer("reference", torch.as_tensor(reference, dtype=torch.float32))
        self.register_buffer("projection", torch.tensor(configuration["projection"], dtype=torch.float32))
        self.register_buffer("center", torch.tensor(configuration["center"], dtype=torch.float32))
        if self.reference.ndim != 2 or self.reference.shape[1] != DIMENSION or self.projection.shape != (DIMENSION, 64):
            raise ValueError("Invalid 520-signal consolidation shapes")
        self.register_buffer("projectedReference", (self.reference - self.center) @ self.projection)

    def distances(self, observations):
        projected = (observations - self.center) @ self.projection
        candidates = torch.cdist(projected, self.projectedReference).topk(
            self.configuration["nearestCandidates"], largest=False).indices
        actual = (observations[:, None, :] - self.reference[candidates]).square().mean(-1).sqrt()
        return actual.min(-1).values

    def forward(self, observations):
        d = (self.distances(observations) - self.configuration["exactRetentionDeadband"]).clamp_min(0)
        return -torch.expm1(-(d / self.configuration["bandwidth"]).square())


class GrowingNeuralFeatures(nn.Module):
    def __init__(self, basis, capacity=512):
        super().__init__()
        n = basis["centerCount"]
        if basis.get("dimension") != DIMENSION or not n <= capacity <= 1024:
            raise ValueError("A 520-signal feature basis and bounded capacity are required")
        centers = torch.zeros(capacity, DIMENSION)
        radii = torch.ones(capacity)
        enabled = torch.zeros(capacity)
        centers[:n] = torch.tensor(basis["centers"], dtype=torch.float32)
        radii[:n] = torch.tensor(basis["radii"], dtype=torch.float32)
        enabled[:n] = 1
        self.register_buffer("centers", centers)
        self.register_buffer("radii", radii)
        self.register_buffer("enabled", enabled)

    def forward(self, observations):
        r = torch.cdist(observations, self.centers) / (DIMENSION ** .5 * self.radii)
        return (1 - r).clamp_min(0).pow(4) * (4 * r + 1) * self.enabled


class AxisReadout(nn.Module):
    def __init__(self, capacity):
        super().__init__()
        self.steering = nn.Parameter(torch.zeros(capacity))
        self.pedal = nn.Parameter(torch.zeros(capacity))

    def forward(self, features):
        return torch.stack([features @ self.steering, features @ self.pedal], -1)


class NeuralIntentActor(nn.Module):
    def __init__(self, basis, reference, configuration, capacity=512):
        super().__init__()
        self.layers = nn.Sequential(GrowingNeuralFeatures(basis, capacity), AxisReadout(capacity))
        self.consolidation = NeuralConsolidation(reference, configuration)
        self.motorBias = nn.Parameter(torch.zeros(2))
        self.motorGain = nn.Parameter(torch.zeros(2))

    def deterministic(self, observations):
        gate = self.consolidation(observations)[:, None]
        additive = torch.tanh(self.layers(observations) + self.motorBias) * gate
        modulation = torch.tanh(self.motorGain).expand(len(observations), -1) * gate
        return torch.cat([additive, modulation], -1)

    @torch.no_grad()
    def grow(self, actual_observations, maximum=8):
        features = self.layers[0]
        before = self.layers(actual_observations).clone()
        added = []
        for _ in range(maximum):
            inactive = (features.enabled == 0).nonzero().flatten()
            if len(inactive) == 0:
                break
            novelty = self.consolidation(actual_observations) > 0
            support = features(actual_observations).max(-1).values < .01
            novel = novelty & support
            if not novel.any():
                break
            active = (features.enabled > 0).nonzero().flatten()
            distances = torch.cdist(actual_observations, features.centers[active]) / (DIMENSION ** .5)
            nearest = distances.min(-1).values
            nearest[~novel] = -1
            row = int(nearest.argmax())
            slot = int(inactive[0])
            if self.layers[-1].steering[slot] != 0 or self.layers[-1].pedal[slot] != 0:
                raise AssertionError("New neural features must begin with zero motor influence")
            features.centers[slot] = actual_observations[row]
            features.radii[slot] = max(.005, .6 * float(nearest[row]))
            features.enabled[slot] = 1
            added.append({"slot": slot, "actualObservationRow": row, "radius": float(features.radii[slot])})
        after = self.layers(actual_observations)
        if not torch.equal(before, after):
            raise AssertionError("Zero-weight feature growth changed the policy")
        return {"added": added, "enabledFeatures": int(features.enabled.sum()), "maximumMeanChange": 0.}
