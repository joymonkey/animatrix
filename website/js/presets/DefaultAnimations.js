/**
 * DefaultAnimations.js
 * Pre-bundled preset configurations and generator integration for Animatrix Studio.
 * Synchronized to standard composite frame counts (24, 36, 48, 60 frames) for polyrhythmic looping.
 */

import { Generators } from '../tools/Generators.js';

export class PresetLibrary {
  static getPresets() {
    return [
      {
        id: 'cylon',
        name: 'Cylon / KITT Visor Sweep',
        description: 'Sweeping beam or chevron with customizable shapes, fading tails, and turnaround boundaries.',
        defaultOptions: {
          shape: 'fading_line',
          leftEndMode: 'offscreen',
          rightEndMode: 'offscreen',
          beamWidth: 3,
          tailLength: 6,
          framesPerPass: 24,
          repetitions: 1,
          roundTrip: true,
          startDirection: 'left_to_right'
        }
      },
      {
        id: 'robot_eyes',
        name: 'Robotic Eye Expressions',
        description: 'Dual robotic eye clusters with configurable styles (blocks, slits, tech brackets) and expressions (blink, wink, squint, scan).',
        defaultOptions: {
          expression: 'blink',
          style: 'block',
          eyeWidth: 10,
          targetTotalFrames: 48
        }
      },
      {
        id: 'equalizer',
        name: 'Audio Spectrum Equalizer',
        description: 'Dynamic multi-band audio visualizer bounce with solid bars, floating peak dots, or symmetrical waveforms.',
        defaultOptions: {
          style: 'solid',
          bands: 16,
          numFrames: 48
        }
      },
      {
        id: 'pulse',
        name: 'Visor Pulse & Heartbeat',
        description: 'Rhythmic helmet pulses: smooth sinusoidal breathing, double heartbeat thump, curtain wipe, or rapid strobe.',
        defaultOptions: {
          pattern: 'breathe',
          numPulses: 2,
          framesPerCycle: 24
        }
      },
      {
        id: 'marquee',
        name: 'Text Marquee Scroller',
        description: 'Smooth scrolling ticker using 3-row micro bitmap font alphabet.',
        defaultOptions: {
          text: 'ANIMATRIX',
          scrollDirection: 'left',
          tracking: 1
        }
      }
    ];
  }

  static loadPreset(presetId, matrixState, customOptions = {}, insertionOptions = {}) {
    const gen = new Generators(matrixState);
    const preset = this.getPresets().find(p => p.id === presetId);
    const opts = Object.assign({}, preset ? preset.defaultOptions : {}, customOptions);
    opts.insertion = insertionOptions;

    // In overlay mode, automatically align target total frames to active timeline length
    if (insertionOptions && insertionOptions.mode === 'overlay') {
      const isBlankSingle = matrixState.frames.length === 1 && matrixState.frames[0].data.every(v => v === 0);
      if (!isBlankSingle && matrixState.frames.length > 0) {
        if (!opts.targetTotalFrames) {
          opts.targetTotalFrames = matrixState.frames.length;
        }
      }
    }

    switch (presetId) {
      case 'cylon':
        gen.generateCylonScanner(opts);
        break;

      case 'robot_eyes':
      case 'robot_blink':
        if (customOptions.eyeWidth === undefined && matrixState.width <= 16) {
          opts.eyeWidth = Math.max(2, Math.floor((matrixState.width - 2) / 2));
        }
        gen.generateRobotEyes(opts);
        break;

      case 'marquee':
        gen.generateMarquee(opts.text || 'ANIMATRIX', opts);
        break;

      case 'equalizer':
        gen.generateEqualizer(opts);
        break;

      case 'pulse':
        gen.generatePulse(opts);
        break;

      default:
        console.warn('Unknown preset:', presetId);
    }
  }
}
