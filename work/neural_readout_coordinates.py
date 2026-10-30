"""Materialize18reward-searched coordinates into a numeric neural readout.

The unsupervised directions use actual neuronal observations, never target
actions. Inference uses the existing521-64-64-2data-only model, not a PCA driver.
"""
import copy
import numpy as np


def materialize(source,prepared,genes):
    if prepared.get('format')!='male-cns-unsupervised-neural-readout-basis' or prepared.get('dimensions')!=18 or source['layers'][:2]!=prepared['sourceBodyLayers']:
        raise ValueError('Matching frozen neural encoder and18coordinate basis required')
    x=np.asarray(genes,dtype=np.float64)
    if x.shape!=(18,) or not np.isfinite(x).all() or np.max(np.abs(x))>100:
        raise ValueError('Eighteen bounded numeric coordinates required')
    actor=copy.deepcopy(source)
    if not np.any(x):return actor
    mean=np.asarray(prepared['mean'],dtype=np.float64)
    scale=np.asarray(prepared['scale'],dtype=np.float64)
    components=np.asarray(prepared['components'],dtype=np.float64)
    deviation=np.asarray(prepared['componentStd'],dtype=np.float64)
    if mean.shape!=(64,) or scale.shape!=(64,) or components.shape!=(8,64) or deviation.shape!=(8,) or np.min(scale)<=0 or np.min(deviation)<=0:
        raise ValueError('Bounded actual neuronal projection required')
    coefficients=x[2:].reshape(8,2).T*np.asarray([[.2],[1.]])
    delta=coefficients@(components/(scale[None,:]*deviation[:,None]))
    weights=np.asarray(source['layers'][2]['weights'],dtype=np.float64)+delta
    bias=np.asarray(source['layers'][2]['bias'],dtype=np.float64)+x[:2]*[.2,1.]-delta@mean
    if not np.isfinite(weights).all() or not np.isfinite(bias).all() or max(np.max(np.abs(weights)),np.max(np.abs(bias)))>1000:
        raise ValueError('Finite bounded numeric neural readout required')
    actor['layers'][2]['weights']=weights.astype(np.float32).tolist()
    actor['layers'][2]['bias']=bias.astype(np.float32).tolist()
    return actor
