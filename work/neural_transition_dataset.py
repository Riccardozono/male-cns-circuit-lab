"""Read complete, provenance-checked actual neuronal transitions, never examples invented here."""
from pathlib import Path
import numpy as np
from neuronal_experiment_io import file_hash

OBSERVATIONS=557
COLUMNS=1118


def load_episode(record):
    episode=record['rollout'];file=Path(episode['dataFile'])
    if not episode['complete'] or episode['censored'] or not episode['dataComplete'] or episode['gasBrakeOverlapSteps']:
        raise ValueError('Only genuinely completed uncensored physical episodes may enter returns')
    if episode['columns']!=COLUMNS or file.suffix!='.f32' or file_hash(file)!=record['dataSha256'] or file.stat().st_size!=episode['rows']*COLUMNS*4:
        raise ValueError('Bounded exact binary transition provenance required')
    data=np.memmap(file,dtype='<f4',mode='r',shape=(episode['rows'],COLUMNS))
    validate_rows(data)
    if abs(float(data[:,559].astype(np.float64).sum())-episode['totalActualReward'])>1e-4:
        raise ValueError('Actual transition rewards do not sum to the recorded real reward')
    return data


def validate_rows(data):
    if data.ndim!=2 or data.shape[1]!=COLUMNS or not len(data) or not np.isfinite(data).all():
        raise ValueError('Finite complete transition matrix required')
    if np.max(np.abs(data[:,:557]))>10 or np.max(np.abs(data[:,561:]))>10 or np.max(np.abs(data[:,557:559]))>1:
        raise ValueError('Observation/action bounds violated')
    if not np.all(data[:-1,560]==0) or data[-1,560]!=1:
        raise ValueError('Exactly one actual termination at the end of each episode required')
    if len(data)>1 and not np.array_equal(data[:-1,561:],data[1:,:557]):
        raise ValueError('Actual next/pre states do not align across consecutive controls')


def complete_returns(data,gamma=.999):
    validate_rows(data)
    if not 0<gamma<=1:raise ValueError('Valid return discount required')
    result=np.empty(len(data),dtype=np.float32);value=0.
    for i in range(len(data)-1,-1,-1):
        value=float(data[i,559])+gamma*value
        result[i]=value
    return result
