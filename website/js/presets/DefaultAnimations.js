/**
 * DefaultAnimations.js
 * Pre-bundled preset configurations and generator integration for Animatrix Studio.
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
          framesPerPass: 40,
          repetitions: 1,
          roundTrip: false,
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
          holdDurationMs: 1200
        }
      },
      {
        id: 'equalizer',
        name: 'Audio Spectrum Equalizer',
        description: 'Dynamic multi-band audio visualizer bounce with solid bars, floating peak dots, or symmetrical waveforms.',
        defaultOptions: {
          style: 'solid',
          bands: 16,
          numFrames: 40
        }
      },
      {
        id: 'pulse',
        name: 'Visor Pulse & Heartbeat',
        description: 'Rhythmic helmet pulses: smooth sinusoidal breathing, double heartbeat thump, curtain wipe, or rapid strobe.',
        defaultOptions: {
          pattern: 'breathe',
          numPulses: 2,
          framesPerCycle: 20
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

    switch (presetId) {
      case 'cylon':
        gen.generateCylonScanner(opts);
        break;

      case 'robot_eyes':
      case 'robot_blink':
        if (customOptions.eyeWidth === undefined && matrixState.width === 16) {
          opts.eyeWidth = 6;
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
