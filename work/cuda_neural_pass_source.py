"""Exact-order float64 CUDA component prototype; not installed in the app."""
from cuda_v8_math_source import source as math_source

def source():
    return math_source()+r'''
extern "C" __global__ void neural_pass(
    const unsigned int* offsets, const unsigned int* sources,
    const double* scaled, const double* injection, const double* activity,
    const double* gains, double* next, double* sum, int n, int batch) {
  const int index = blockIdx.x * blockDim.x + threadIdx.x;
  if (index >= n*batch) return;
  const int neuron = index % n;
  const int row = (index / n)*n;
  double value = injection[index];
  for (unsigned int e=offsets[neuron]; e<offsets[neuron+1]; ++e) {
    const unsigned int src = sources[e];
    const double first = __dmul_rn(scaled[e], activity[row+src]);
    const double term = __dmul_rn(first, gains[row+src]);
    value = __dadd_rn(value, term);
  }
  sum[index] = value;
  next[index] = __dadd_rn(__dmul_rn(0.45, activity[index]), __dmul_rn(0.55, v8_tanh(value)));
}
'''
