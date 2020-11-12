const QRCode = require('qrcode');

module.exports = class DOMManipulations {

  constructor(element, options, clickCallback) {
    this._element         = element;
    this._translations    = options.translations;
    this._showHelper      = options.showHelper;
    this._showCloseButton = options.showCloseButton;
    this._clickCallback   = clickCallback;

    this._renderInitialState();
    this._attachEventHandlers();
  }

  renderState(state) {
    let newPartial = this._stateToPartialMapping()[state.newState];
    if (!newPartial) throw new Error(`I don't know how to render '${state.newState}'`);
    this._renderPartial(newPartial);

    if ( state.isFinal ) {
      // Make sure all restart buttons are hidden when being in a final state
      this._element.querySelectorAll('.irma-web-restart-button')
        .forEach(e => e.style.display = 'none');
    }
  }

  setQRCode(qr) {
    QRCode.toCanvas(
      this._element.querySelector('.irma-web-qr-canvas'),
      qr,
      {width: '230', margin: '1'}
    );
  }

  setPairingCode(pairingCode) {
    // TODO: Check pairing code.
  }

  setButtonLink(link) {
    this._element.querySelector('.irma-web-button-link')
      .setAttribute('href', link);
  }

  _renderInitialState() {
    this._element.classList.add('irma-web-form');
    this._element.innerHTML = this._irmaWebForm(this._stateUninitialized());
  }

  _attachEventHandlers() {
    // Polyfill for Element.matches to fix IE11
    if (!Element.prototype.matches) {
      Element.prototype.matches = Element.prototype.msMatchesSelector ||
                                  Element.prototype.webkitMatchesSelector;
    }

    this._element.addEventListener('click', (e) => {
      if (e.target.matches('[data-irma-glue-transition]')) {
        this._clickCallback(e.target.getAttribute('data-irma-glue-transition'));
      }
    });

    this._element.addEventListener('keydown', (e) => {
      if (e.target.parentElement.className == 'irma-web-pairing-code') {
        e.target.prevValue = e.target.value;
        if (e.key != 'Enter') e.target.value = '';
      }
    });

    this._element.addEventListener('keyup', (e) => {
      if (e.target.parentElement.className == 'irma-web-pairing-code') {
        let prevElement = e.target.previousElementSibling;
        if (prevElement && e.target.value === e.target.prevValue && e.key == 'Backspace') {
          prevElement.value = '';
          prevElement.focus();
        }
        let fn = e.target.form.querySelectorAll('input:invalid').length == 0 ? 'add' : 'remove';
        e.target.form.querySelector('#irma-web-pairing-submit').classList[fn]('irma-web-pairing-submit-valid'); // TODO: Remove ID
      }
    });

    this._element.addEventListener('input', (e) => {
      if (e.target.parentElement.className == 'irma-web-pairing-code') {
        let nextElement = e.target.nextElementSibling;
        if (nextElement && e.target.value) nextElement.focus();
      }
    });

    this._element.addEventListener('submit', (e) => {
      if (e.target.className == 'irma-web-pairing-form') {
        e.preventDefault();
        // TODO: Check whether code is valid.
        this._clickCallback('pairingCompleted');
      }
    });
  }

  _renderPartial(newPartial) {
    this._element
        .querySelector('.irma-web-content .irma-web-centered')
        .innerHTML = newPartial.call(this);
  }

  _stateToPartialMapping() {
    return {
      Uninitialized:        this._stateUninitialized,
      Loading:              this._stateLoading,
      MediumContemplation:  this._stateLoading,
      ShowingQRCode:        this._stateShowingQRCode,
      Pairing:              this._statePairing,
      ContinueOn2ndDevice:  this._stateContinueInIrmaApp,
      ShowingIrmaButton:    this._stateShowingIrmaButton,
      ShowingQRCodeInstead: this._stateShowingQRCodeInstead,
      ContinueInIrmaApp:    this._stateContinueInIrmaApp,
      Cancelled:            this._stateCancelled,
      TimedOut:             this._stateTimedOut,
      Error:                this._stateError,
      BrowserNotSupported:  this._stateBrowserNotSupported,
      Success:              this._stateSuccess,
      Aborted:              () => '',
    };
  }

  /** Container markup **/

  _irmaWebForm(content) {
    return `
      <div class="irma-web-header ${this._showHelper ? 'irma-web-show-helper' : ''}">
        <p>${this._translations.header}</p>
        <div class="irma-web-helper">
          <p>${this._translations.helper}</p>
        </div>
        ${this._showCloseButton ? `
          <button class="irma-web-close"></button>
        ` : ''}
      </div>
      <div class="irma-web-content">
        <div class="irma-web-centered">
          ${content}
        </div>
      </div>
    `;
  }

  /** States markup **/

  _stateUninitialized() {
    return `
      <!-- State: Uninitialized -->
      <div class="irma-web-loading-animation">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <p>${this._translations.loading}</p>
    `;
  }

  _stateLoading() {
    return `
      <!-- State: Loading -->
      <div class="irma-web-loading-animation">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <p>${this._translations.loading}</p>
    `;
  }

  _stateShowingQRCode() {
    return `
      <!-- State: ShowingQRCode -->
      <canvas class="irma-web-qr-canvas"></canvas>
    `;
  }

  _stateShowingIrmaButton() {
    return `
      <!-- State: ShowingButton -->
      <a class="irma-web-button-link">
        <button class="irma-web-button">${this._translations.button}</button>
      </a>
      <p><a data-irma-glue-transition="chooseQR">${this._translations.qrCode}</a></p>
    `;
  }

  _stateShowingQRCodeInstead() {
    return `
      <!-- State: ShowingQRCode -->
      <canvas class="irma-web-qr-canvas"></canvas>
      <p class="irma-web-restart-button"><a data-irma-glue-transition="restart">${this._translations.back}</a></p>
    `;
  }

  _statePairing() {
    // TODO: I don't see a pairing code?
    return `
      <!-- State: Pairing -->
      <form class="irma-web-pairing-form">
        <p>Vul de koppelcode in die in jouw IRMA-app verschijnt.</p>
        <div class="irma-web-pairing-code">
          <input inputmode="numeric" pattern="\\d" maxlength="1" required />
          <input inputmode="numeric" pattern="\\d" maxlength="1" required />
          <input inputmode="numeric" pattern="\\d" maxlength="1" required />
          <input inputmode="numeric" pattern="\\d" maxlength="1" required />
        </div>
        <button id="irma-web-pairing-submit" type="submit">
          Volgende
        </button>
        <p><a>Annuleer</a></p>
      </form>
    `;
  }

  _stateContinueInIrmaApp() {
    return `
      <!-- State: WaitingForUser -->
      <div class="irma-web-waiting-for-user-animation"></div>
      <p>${this._translations.app}</p>
      <p class="irma-web-restart-button"><a data-irma-glue-transition="restart">${this._translations.retry}</a></p>
    `;
  }

  _stateCancelled() {
    return `
      <!-- State: Cancelled -->
      <div class="irma-web-forbidden-animation"></div>
      <p>${this._translations.cancelled}</p>
      <p class="irma-web-restart-button"><a data-irma-glue-transition="restart">${this._translations.retry}</a></p>
    `;
  }

  _stateTimedOut() {
    return `
      <!-- State: TimedOut -->
      <div class="irma-web-clock-animation"></div>
      <p>${this._translations.timeout}</p>
      <p class="irma-web-restart-button"><a data-irma-glue-transition="restart">${this._translations.retry}</a></p>
    `;
  }

  _stateError() {
    return `
      <!-- State: Error -->
      <div class="irma-web-forbidden-animation"></div>
      <p>${this._translations.error}</p>
      <p class="irma-web-restart-button"><a data-irma-glue-transition="restart">${this._translations.retry}</a></p>
    `;
  }

  _stateBrowserNotSupported() {
    return `
      <!-- State: BrowserNotSupported -->
      <div class="irma-web-forbidden-animation"></div>
      <p>${this._translations.browser}</p>
    `;
  }

  _stateSuccess() {
    return `
      <!-- State: Success -->
      <div class="irma-web-checkmark-animation"></div>
      <p>${this._translations.success}</p>
    `;
  }

};
