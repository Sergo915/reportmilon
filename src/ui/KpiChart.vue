<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import kpi from '../report/kpi.cjs';
import decimals from '../report/filter.cjs';
import axes from '../report/kpi-axis.cjs';
const props = defineProps({ wide: Boolean, balanced: Boolean, series: Object, metric: String, title: String, period: String, ranges: Object });
const active = ref(null), cursors = ref([0, 0]), chart = ref(null), width = ref(320), availableHeight = ref(158);

let observer;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width; availableHeight.value = entry.contentRect.height; });
  observer.observe(chart.value);
});
onUnmounted(() => observer?.disconnect());
// The visible data lines and points keep the same 25.5px inset
// as the title. The legend starts 16px below the scrolling body.
const svgHeight = computed(() => props.balanced ? Math.max(158, availableHeight.value + 16 - 2 * 25.5) : 158);
const plotTop = computed(() => props.balanced ? 4.5 : 16);
const plotBottom = computed(() => props.balanced ? svgHeight.value - 4.5 : 110);
const plotHeight = computed(() => plotBottom.value - plotTop.value);
const labels = ['Ընտրված', 'Համեմատություն'];
const lines = computed(() => [props.series.current, props.series.previous].filter(line => line !== null));
const selected = computed(() => props.series.current || []);
const length = computed(() => Math.max(1, ...lines.value.map(line => line.length)));
const narrow = computed(() => width.value < 260);
const scale = computed(() => axes.axisScale(lines.value, props.metric, narrow.value, props.balanced));
const ticks = computed(() => axes.xTickIndices(selected.value.length, narrow.value));
const margin = computed(() => {
  if (!props.wide) return narrow.value ? Math.min(54, width.value * .34) : 72;
  const context = document.createElement('canvas').getContext('2d');
  context.font = `10px ${chart.value ? getComputedStyle(chart.value).fontFamily : 'Arial'}`;
  return Math.max(...scale.value.ticks.flatMap(tick => labelRows(tick.label)).map(text => context.measureText(text).width)) + 7;
});
const rightInset = computed(() => margin.value);
const plotWidth = computed(() => Math.max(1, width.value - margin.value - rightInset.value));
const daily = computed(() => props.period === 'month' || (props.period === 'custom' && props.ranges?.current?.[0]?.min && props.ranges?.current?.[0]?.max
  && (Date.parse(props.ranges.current[0].max) - Date.parse(props.ranges.current[0].min)) / 86400000 < 31));
function x(index) { return margin.value + (length.value === 1 ? .5 : index / (length.value - 1)) * plotWidth.value; }
const firstLabelGap = computed(() => {
  if (!props.wide || !selected.value.length) return 0;
  const context = document.createElement('canvas').getContext('2d');
  context.font = `${props.balanced ? 9 : 10}px ${chart.value ? getComputedStyle(chart.value).fontFamily : 'Arial'}`;
  const lastWidth = Math.max(...labelParts(selected.value.at(-1)).map(text => context.measureText(text).width));
  return 16 + rightInset.value - lastWidth / 2;
});
function labelX(index) { return x(index) + (props.wide && index === 0 ? firstLabelGap.value : 0); }
function labelParts(point) { return axes.dateParts(point, daily.value, narrow.value, props.wide); }
function y(point) {
  const value = decimals.decimal(String(point[props.metric]), true);
  const upper = scale.value.upper, lower = scale.value.lower || { coefficient: 0n, scale: 0 };
  const precision = Math.max(value.scale, upper.scale, lower.scale);
  const toInteger = number => number.coefficient * 10n ** BigInt(precision - number.scale);
  const ratio = (toInteger(value) - toInteger(lower)) * 1000000n / (toInteger(upper) - toInteger(lower));
  return plotBottom.value - Number(ratio) / 1000000 * plotHeight.value;
}
function labelRows(text) {
  if (props.wide && props.metric === 'amount') return [text.replace(/ ֏$/, '')];
  if (props.metric === 'count' || text.length <= 6) return [text];
  const marker = text.lastIndexOf(' ');
  const before = text.slice(0, marker);
  const split = before.lastIndexOf(' ');
  return split < 0 ? [before, '֏'] : [before.slice(0, split), `${before.slice(split + 1)} ֏`];
}
function description(point, line) {
  return `${labels[line]}՝ ${kpi.rangeText([point])} · ${kpi.valueText(point[props.metric], props.metric)}`;
}
function move(event, line, index) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const end = lines.value[line].length - 1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? end
    : Math.max(0, Math.min(end, index + (event.key === 'ArrowRight' ? 1 : -1)));
  cursors.value[line] = next;
  event.currentTarget.parentElement.children[next].focus();
}
watch(() => props.series, () => { active.value = null; cursors.value = [0, 0]; });
</script>

<template>
  <div ref="chart" class="kpi-chart" :aria-label="`${title}՝ ժամանակային գրաֆիկ`" role="group" @click.stop @keydown.stop>
    <template v-if="lines.some(line => line.length)">
      <div v-if="!wide" class="kpi-legend" aria-hidden="true">
        <span v-for="(line, index) in lines" :key="index"><i :class="`kpi-line-${index}`"></i>{{ labels[index] }}</span>
      </div>
      <svg :viewBox="`0 0 ${width} ${svgHeight}`" :style="balanced ? { height: `${svgHeight}px` } : undefined" :aria-label="`${title}՝ ժամանակային գրաֆիկ`" role="group">
        <g class="kpi-axis" data-testid="kpi-axes">
          <path :d="`M${margin} ${plotTop}V${plotBottom}H${width - rightInset}`" fill="none" stroke="#94a3b8" />
          <g v-for="tick in scale.ticks" :key="tick.value" data-testid="kpi-y-tick">
            <line :x1="margin - 4" :x2="width - rightInset" :y1="plotBottom - tick.fraction * plotHeight" :y2="plotBottom - tick.fraction * plotHeight" stroke="#dbe4ef" />
            <text :x="margin - 7" :y="plotBottom - tick.fraction * plotHeight + (labelRows(tick.label).length === 1 ? 3 : 0)" text-anchor="end">
              <tspan v-for="(row, rowIndex) in labelRows(tick.label)" :key="rowIndex" :x="margin - 7" :dy="rowIndex ? 10 : 0" :textLength="!wide && row.length * 5.5 > margin - 9 ? margin - 9 : undefined" lengthAdjust="spacingAndGlyphs">{{ row }}</tspan>
            </text>
          </g>
          <g v-for="index in ticks" :key="index" data-testid="kpi-x-tick">
            <line v-if="!wide" :x1="x(index)" :x2="x(index)" :y1="plotBottom" :y2="plotBottom + 4" stroke="#94a3b8" />
            <text :x="labelX(index)" :y="plotBottom + (wide ? 7 : 18)" :dominant-baseline="wide ? 'text-before-edge' : undefined" :font-size="balanced ? 9 : undefined" :text-anchor="index === 0 && selected.length > 1 ? 'start' : index === selected.length - 1 && selected.length > 1 ? (wide ? 'middle' : 'end') : 'middle'">
              <tspan v-for="(part, partIndex) in labelParts(selected[index])" :key="partIndex" :x="labelX(index)" :dy="partIndex ? (balanced ? 9 : 11) : 0">{{ part }}</tspan>
            </text>
          </g>
        </g>
        <template v-for="(line, lineIndex) in lines" :key="lineIndex">
          <polyline v-if="line.length" :points="line.map((point, index) => `${x(index)},${y(point)}`).join(' ')"
            fill="none" :stroke="lineIndex ? '#94a3b8' : '#6685eb'" stroke-width="2.5"
            vector-effect="non-scaling-stroke" :data-testid="`kpi-line-${lineIndex}`" />
          <g>
            <circle v-for="(point, index) in line" :key="point.min" :cx="x(index)" :cy="y(point)" r="4"
              :fill="lineIndex ? '#94a3b8' : '#6685eb'" stroke="white" stroke-width="1"
              :tabindex="cursors[lineIndex] === index ? 0 : -1" role="button" :aria-label="description(point, lineIndex)"
              @mouseenter="active = description(point, lineIndex)" @mouseleave="active = null"
              @focus="active = description(point, lineIndex)" @blur="active = null"
              @click="active = description(point, lineIndex)" @keydown="move($event, lineIndex, index)" />
          </g>
        </template>
      </svg>
      <p class="kpi-chart-tooltip" role="status">{{ active || ' ' }}</p>
    </template>
    <p v-else class="kpi-notice">Տվյալներ չկան</p>
  </div>
</template>
