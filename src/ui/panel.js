export function initUI() {
  const countSlider = document.getElementById('count');
  const powerSlider = document.getElementById('power');
  const countLabel  = document.getElementById('countLabel');
  const powerLabel  = document.getElementById('powerLabel');
  const showPaths   = document.getElementById('showPaths');
  const spinCards   = document.getElementById('spinCards');
  const resetBtn    = document.getElementById('resetBtn');

  const setLabels = () => {
    countLabel.textContent = countSlider.value;
    powerLabel.textContent = powerSlider.value;
  };
  setLabels();

  return {
    elements: { countSlider, powerSlider, showPaths, spinCards, resetBtn },
    onInput: (fn) => {
      countSlider.addEventListener('input', () => { setLabels(); fn(); });
      powerSlider.addEventListener('input', setLabels);
    },
    values: () => ({
      count: countSlider.value | 0,
      power: powerSlider.value | 0,
      showPaths: !!showPaths.checked,
      spin: !!spinCards.checked
    })
  };
}
