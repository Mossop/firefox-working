export const description = `
Validation tests for setVertexBuffer on render pass and render bundle.
`;

import { makeTestGroup } from '../../../../../../common/framework/test_group.js';
import { makeValueTestVariant } from '../../../../../../common/util/util.js';
import { GPUConst } from '../../../../../constants.js';
import { kResourceStates, AllFeaturesMaxLimitsGPUTest } from '../../../../../gpu_test.js';
import * as vtu from '../../../validation_test_utils.js';

import { kRenderEncodeTypeParams, buildBufferOffsetAndSizeOOBTestParams } from './render.js';

export const g = makeTestGroup(AllFeaturesMaxLimitsGPUTest);

g.test('slot')
  .desc(
    `
Tests slot must be less than the maxVertexBuffers in device limits.
  `
  )
  .paramsSubcasesOnly(
    kRenderEncodeTypeParams.combine('slotVariant', [
      { mult: 0, add: 0 },
      { mult: 1, add: -1 },
      { mult: 1, add: 0 },
    ] as const)
  )
  .fn(t => {
    const { encoderType, slotVariant } = t.params;
    const maxVertexBuffers = t.device.limits.maxVertexBuffers;
    const slot = makeValueTestVariant(maxVertexBuffers, slotVariant);

    const vertexBuffer = vtu.createBufferWithState(t, 'valid', {
      size: 16,
      usage: GPUBufferUsage.VERTEX,
    });

    const { encoder, validateFinish } = t.createEncoder(encoderType);
    encoder.setVertexBuffer(slot, vertexBuffer);
    validateFinish(slot < maxVertexBuffers);
  });

g.test('vertex_buffer_state')
  .desc(
    `
Tests vertex buffer must be valid.
  `
  )
  .paramsSubcasesOnly(kRenderEncodeTypeParams.combine('state', kResourceStates))
  .fn(t => {
    const { encoderType, state } = t.params;
    const vertexBuffer = vtu.createBufferWithState(t, state, {
      size: 16,
      usage: GPUBufferUsage.VERTEX,
    });

    const { encoder, validateFinishAndSubmitGivenState } = t.createEncoder(encoderType);
    encoder.setVertexBuffer(0, vertexBuffer);
    validateFinishAndSubmitGivenState(state);
  });

g.test('vertex_buffer,device_mismatch')
  .desc('Tests setVertexBuffer cannot be called with a vertex buffer created from another device')
  .paramsSubcasesOnly(kRenderEncodeTypeParams.combine('mismatched', [true, false]))
  .beforeAllSubcases(t => t.usesMismatchedDevice())
  .fn(t => {
    const { encoderType, mismatched } = t.params;
    const sourceDevice = mismatched ? t.mismatchedDevice : t.device;

    const vertexBuffer = t.trackForCleanup(
      sourceDevice.createBuffer({
        size: 16,
        usage: GPUBufferUsage.VERTEX,
      })
    );

    const { encoder, validateFinish } = t.createEncoder(encoderType);
    encoder.setVertexBuffer(0, vertexBuffer);
    validateFinish(!mismatched);
  });

g.test('vertex_buffer_usage')
  .desc(
    `
Tests vertex buffer must have 'Vertex' usage.
  `
  )
  .paramsSubcasesOnly(
    kRenderEncodeTypeParams.combine('usage', [
      GPUConst.BufferUsage.VERTEX, // control case
      GPUConst.BufferUsage.COPY_DST,
      GPUConst.BufferUsage.COPY_DST | GPUConst.BufferUsage.VERTEX,
    ] as const)
  )
  .fn(t => {
    const { encoderType, usage } = t.params;
    const vertexBuffer = t.createBufferTracked({
      size: 16,
      usage,
    });

    const { encoder, validateFinish } = t.createEncoder(encoderType);
    encoder.setVertexBuffer(0, vertexBuffer);
    validateFinish((usage & GPUBufferUsage.VERTEX) !== 0);
  });

g.test('offset_alignment')
  .desc(
    `
Tests offset must be a multiple of 4.
  `
  )
  .paramsSubcasesOnly(kRenderEncodeTypeParams.combine('offset', [0, 2, 4] as const))
  .fn(t => {
    const { encoderType, offset } = t.params;
    const vertexBuffer = t.createBufferTracked({
      size: 16,
      usage: GPUBufferUsage.VERTEX,
    });

    const { encoder, validateFinish: finish } = t.createEncoder(encoderType);
    encoder.setVertexBuffer(0, vertexBuffer, offset);
    finish(offset % 4 === 0);
  });

g.test('offset_and_size_oob')
  .desc(
    `
Tests offset and size cannot be larger than vertex buffer size.
  `
  )
  .paramsSubcasesOnly(buildBufferOffsetAndSizeOOBTestParams(4, 256))
  .fn(t => {
    const { encoderType, offset, size, _valid } = t.params;
    const vertexBuffer = t.createBufferTracked({
      size: 256,
      usage: GPUBufferUsage.VERTEX,
    });

    const { encoder, validateFinish } = t.createEncoder(encoderType);
    encoder.setVertexBuffer(0, vertexBuffer, offset, size);
    validateFinish(_valid);
  });
