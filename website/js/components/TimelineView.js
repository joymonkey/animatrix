/**
 * TimelineView.js
 * Renders the multi-frame thumbnail filmstrip at the bottom of the studio.
 * Handles frame selection, drag-and-drop reordering, duration editing, and live thumbnail updates.
 */

export class TimelineView {
  constructor(containerElement, matrixState, animationPlayer) {
    this.container = containerElement;
    this.state = matrixState;
    this.player = animationPlayer;
    this.draggedIndex = -1;

    this._bindStateEvents();
    this.render();
  }

  _bindStateEvents() {
    this.state.subscribe((event, data) => {
      if (event === 'frame_added' || event === 'frame_deleted' || event === 'frames_reordered' || event === 'frames_reloaded' || event === 'frames_reversed' || event === 'matrix_resized') {
        this.render();
      } else if (event === 'active_frame_change') {
        this.updateActiveHighlight(data.activeFrameIndex);
      } else if (event === 'pixel_change') {
        this.updateThumbnail(data.frameIndex);
      } else if (event === 'frame_duration_change') {
        this.updateDurationBadge(data.frameIndex, data.durationMs);
      } else if (event === 'global_fps_change') {
        this.state.frames.forEach((frame, idx) => {
          this.updateDurationBadge(idx, frame.durationMs);
        });
      }
    });
  }

  render() {
    this.container.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'timeline-filmstrip';

    this.state.frames.forEach((frame, idx) => {
      const card = this._createFrameCard(frame, idx);
      list.appendChild(card);
    });

    this.container.appendChild(list);
    this.updateActiveHighlight(this.state.activeFrameIndex);
  }

  _createFrameCard(frame, idx) {
    const card = document.createElement('div');
    card.className = `frame-card ${idx === this.state.activeFrameIndex ? 'active' : ''}`;
    card.dataset.index = idx;
    card.draggable = true;

    // Header: Frame Index and Duration
    const header = document.createElement('div');
    header.className = 'frame-card-header';
    header.innerHTML = `
      <span class="frame-index-badge">#${idx + 1}</span>
      <span class="frame-duration-badge" title="Click to edit duration">${frame.durationMs}ms</span>
    `;

    // Duration edit on click
    const durBadge = header.querySelector('.frame-duration-badge');
    durBadge.onclick = (e) => {
      e.stopPropagation();
      const current = frame.durationMs;
      const input = prompt(`Enter duration for Frame #${idx + 1} in milliseconds (e.g. 33, 50, 200, 1000):`, current);
      if (input !== null) {
        const val = parseInt(input, 10);
        if (!isNaN(val) && val >= 10 && val <= 60000) {
          this.state.setFrameDuration(idx, val);
        }
      }
    };

    // Canvas thumbnail
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'frame-thumbnail-canvas';
    this._renderThumbnailCanvas(thumbCanvas, frame);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'frame-card-footer';
    footer.innerHTML = `
      <button class="frame-action-btn dup-btn" title="Duplicate Frame">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="frame-action-btn del-btn" title="Delete Frame">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    footer.querySelector('.dup-btn').onclick = (e) => {
      e.stopPropagation();
      this.state.pushUndo();
      this.state.duplicateFrame(idx);
    };

    footer.querySelector('.del-btn').onclick = (e) => {
      e.stopPropagation();
      this.state.pushUndo();
      this.state.deleteFrame(idx);
    };

    card.appendChild(header);
    card.appendChild(thumbCanvas);
    card.appendChild(footer);

    // Card click -> select frame
    card.onclick = () => {
      this.state.setActiveFrame(idx);
    };

    // Drag & Drop reordering
    card.ondragstart = (e) => {
      this.draggedIndex = idx;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    };

    card.ondragend = () => {
      card.classList.remove('dragging');
      this.draggedIndex = -1;
    };

    card.ondragover = (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
    };

    card.ondragleave = () => {
      card.classList.remove('drag-over');
    };

    card.ondrop = (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (this.draggedIndex >= 0 && this.draggedIndex !== idx) {
        this.state.pushUndo();
        this.state.moveFrame(this.draggedIndex, idx);
      }
    };

    return card;
  }

  _renderThumbnailCanvas(canvas, frame) {
    const w = this.state.width;
    const h = this.state.height;
    const dotSize = 2.5;
    const dotGap = 1;
    const totalW = w * (dotSize + dotGap) + dotGap;
    const totalH = h * (dotSize + dotGap) + dotGap;

    canvas.width = totalW;
    canvas.height = Math.max(20, totalH);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const offsetY = Math.floor((canvas.height - totalH) / 2);

    const rgbMap = {
      red: '255, 30, 0',
      green: '20, 255, 60',
      blue: '30, 130, 255',
      amber: '255, 170, 0',
      white: '220, 230, 255'
    };
    const rgb = rgbMap[this.state.color] || rgbMap.red;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const val = frame.data[y * w + x];
        const px = dotGap + x * (dotSize + dotGap);
        const py = offsetY + dotGap + y * (dotSize + dotGap);

        if (val > 0) {
          ctx.fillStyle = `rgba(${rgb}, ${val / 255})`;
        } else {
          ctx.fillStyle = '#181822';
        }
        ctx.fillRect(px, py, dotSize, dotSize);
      }
    }
  }

  updateAllThumbnails() {
    this.state.frames.forEach((_, idx) => this.updateThumbnail(idx));
  }

  updateThumbnail(frameIndex) {
    const card = this.container.querySelector(`.frame-card[data-index="${frameIndex}"]`);
    if (card) {
      const canvas = card.querySelector('.frame-thumbnail-canvas');
      const frame = this.state.frames[frameIndex];
      if (canvas && frame) {
        this._renderThumbnailCanvas(canvas, frame);
      }
    }
  }

  updateDurationBadge(frameIndex, durationMs) {
    const card = this.container.querySelector(`.frame-card[data-index="${frameIndex}"]`);
    if (card) {
      const badge = card.querySelector('.frame-duration-badge');
      if (badge) badge.textContent = `${durationMs}ms`;
    }
  }

  updateActiveHighlight(activeIndex) {
    const cards = this.container.querySelectorAll('.frame-card');
    cards.forEach((card, idx) => {
      if (idx === activeIndex) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } else {
        card.classList.remove('active');
      }
    });
  }
}
