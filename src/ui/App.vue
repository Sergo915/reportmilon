<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import filters from '../report/filter.cjs';
import chart from '../report/chart.cjs';
import calendar from '../report/period.cjs';
import amountInput from '../report/amount-input.cjs';
import RangeInputs from './RangeInputs.vue';
import MonthPicker from './MonthPicker.vue';
import KpiCard from './KpiCard.vue';
import KpiDealsDialog from './KpiDealsDialog.vue';
import kpi from '../report/kpi.cjs';
import filterIcon from '../../images/filter.png';
import resetIcon from '../../images/reset.png';
const { periods, quickPeriods, quickSelection, calendarContext, defaultSelection, initialSelections, reconcileSelections, togglePeriodValue, periodRanges } = calendar;
const { formatAmountInput, ungroupAmount } = amountInput;
const { chartScale, fullAmount, shortAmount, updatedTime } = chart;
const { calculate, roomOptions, reconcileRooms, toggleRoom, validateRange } = filters;
const mode = ref('rooms'), report = ref(null), loading = ref(false), failed = ref(false);
const updatedAt = ref(null), dialog = ref(null), problemButton = ref(null);
const kpiDialog = ref(null);
const filterContainer = ref(null), wideKpi = ref(false);
let kpiObserver;
onMounted(() => {
  kpiObserver = new ResizeObserver(() => {
    wideKpi.value = filterContainer.value.clientWidth >= 1100;
  });
  kpiObserver.observe(filterContainer.value);
});
onBeforeUnmount(() => kpiObserver?.disconnect());
const months = ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'];
const fields = { rooms: 'Սենյակների քանակ', date: 'Կնքման ամսաթիվ', amount: 'Ընդհանուր արժեք', area: 'Մակերես (մ²)', currency: 'Արժույթ' };
const filterFields = { ...fields, amount: 'Բնակարանի արժեք (֏)', date: 'Կնքման ժամանակահատված' };
const reasons = { missing: 'Լրացված չէ', invalid: 'Անվավեր արժեք', unsupported_currency: 'Աջակցվում է միայն AMD' };
const availableRooms = ref([]), selectedRooms = ref([]);
const quarterRoomRows = computed(() => Array.from({ length: Math.ceil(availableRooms.value.length / 3) },
  (_, index) => availableRooms.value.slice(index * 3, index * 3 + 3)));
const emptyRange = () => ({ draft: { min: '', max: '' }, applied: { min: null, max: null }, errors: {}, badInput: {} });
const ranges = reactive(Object.fromEntries(['amount', 'area', 'date'].map((kind) => [kind, emptyRange()])));
const selectedPeriod = ref('year'), dateRevision = ref(0);
const selectedQuick = ref('current-month'), monthPicker = ref(null);
const hasFilterErrors = computed(() => ['area', 'amount', ...(selectedPeriod.value === 'custom' ? ['date'] : [])]
  .some(kind => Object.keys(ranges[kind].errors).length));
const periodContext = ref(calendarContext());
const periodSelections = ref(initialSelections(periodContext.value));
const activeSelection = computed(() => periodSelections.value[selectedPeriod.value]);
const effectivePeriod = computed(() => selectedPeriod.value === 'quick'
  ? quickSelection(selectedQuick.value, periodContext.value)
  : { period: selectedPeriod.value, selection: activeSelection.value });
const stackedFilters = computed(() => !['last-12', 'all'].includes(effectivePeriod.value.period));
const presetRanges = computed(() => selectedPeriod.value === 'custom' ? undefined
  : periodRanges(effectivePeriod.value.period, periodContext.value, effectivePeriod.value.selection));
const availableMonths = computed(() => periodSelections.value.month?.year === periodContext.value.year
  ? periodContext.value.month : 12);
const selectedComplexes = ref(['tower', 'hills']);
const complexes = [['tower', 'Թաուեր'], ['hills', 'Հիլլս']];
const allRooms = ref(true);
const disabled = computed(() => loading.value || failed.value || !report.value);
const appliedFilters = computed(() => ({
  rooms: selectedRooms.value, complexes: selectedComplexes.value,
  amount: ranges.amount.applied, area: ranges.area.applied,
  date: selectedPeriod.value === 'custom' ? ranges.date.applied : undefined,
  dateRanges: presetRanges.value,
}));
const filtered = computed(() => calculate(report.value?.deals || [], report.value?.year, appliedFilters.value));
const kpiResetRevision = ref(0);
const kpiData = computed(() => report.value ? kpi.calculateKpis(report.value.deals, {
  period: effectivePeriod.value.period, context: periodContext.value, selection: effectivePeriod.value.selection,
  custom: ranges.date.applied, filters: appliedFilters.value,
}) : null);
const categories = computed(() => report.value ? filtered.value[mode.value] : []);
function updatePeriod() {
  periodContext.value = calendarContext(report.value?.deals || []);
  periodSelections.value = reconcileSelections(periodSelections.value, periodContext.value);
  const period = selectedPeriod.value;
  if (Object.hasOwn(periodSelections.value, period) && !periodSelections.value[period]) {
    periodSelections.value[period] = defaultSelection(period, periodContext.value);
  }
}
function futurePeriod(value) {
  return activeSelection.value?.year === periodContext.value.year && value > periodContext.value[selectedPeriod.value];
}
function selectPeriodValue(value) {
  updatePeriod();
  if (!futurePeriod(value)) activeSelection.value.values = togglePeriodValue(activeSelection.value.values, value);
}
function changePeriodYear() {
  updatePeriod();
}
function setAllMonths(clear) {
  updatePeriod();
  activeSelection.value.values = clear ? [periodContext.value.month]
    : Array.from({ length: availableMonths.value }, (_, index) => index + 1);
}
function toggleComplex(value) {
  if (!selectedComplexes.value.includes(value)) selectedComplexes.value = [...selectedComplexes.value, value];
  else if (selectedComplexes.value.length > 1) selectedComplexes.value = selectedComplexes.value.filter((key) => key !== value);
}
function selectAllRooms() {
  allRooms.value = true;
  selectedRooms.value = [...availableRooms.value];
}
function selectRoom(room) {
  selectedRooms.value = toggleRoom(selectedRooms.value, room, allRooms.value ? availableRooms.value : undefined);
  allRooms.value = false;
}
function resetFilters() {
  kpiResetRevision.value++;
  selectedQuick.value = 'current-month';
  monthPicker.value?.close();
  periodSelections.value = initialSelections(calendarContext());
  selectedPeriod.value = 'year'; updatePeriod();
  selectedComplexes.value = ['tower', 'hills'];
  selectAllRooms();
  for (const kind of Object.keys(ranges)) ranges[kind] = emptyRange();
  dateRevision.value++;
}
function editRange(kind, side, event) {
  const range = ranges[kind], input = event.target;
  let text = input.value;
  if (kind === 'amount') {
    const formatted = formatAmountInput(text, input.selectionStart, input.selectionEnd);
    text = formatted.text;
    input.value = text;
    input.setSelectionRange(formatted.start, formatted.end);
  }
  range.draft[side] = text;
  range.badInput[side] = input.validity.badInput;
  const draft = kind === 'amount'
    ? Object.fromEntries(Object.entries(range.draft).map(([key, value]) => [key, ungroupAmount(value)])) : range.draft;
  const result = validateRange(kind, draft, range.badInput);
  range.errors = result.errors;
  if (result.valid) range.applied = result.values;
}
const hasData = computed(() => categories.value.some((entry) => entry.count > 0));
const scale = computed(() => chartScale(categories.value.map((entry) => entry.amount)));
const totalCount = computed(() => categories.value.reduce((sum, entry) => sum + entry.count, 0));
const axisTitle = computed(() => fields[mode.value === 'rooms' ? 'rooms' : 'date']);
const label = (entry) => mode.value === 'rooms' ? String(entry.category) : months[entry.category - 1];
const barWidth = 56;
const viewportWidth = ref(0);
let viewportObserver;
function observeViewport(element) {
  viewportObserver?.disconnect();
  if (!element) return;
  viewportObserver = new ResizeObserver(([entry]) => { viewportWidth.value = entry.contentRect.width; });
  viewportObserver.observe(element);
}
onBeforeUnmount(() => viewportObserver?.disconnect());
// Reserve a full line for each amount and month, even on a narrow viewport.
const categoryWidth = computed(() => Math.max(96, ...categories.value.map((entry) =>
  Math.max((fullAmount(entry.amount).length + 2) * 8, label(entry).length * 12) + 24)));
const width = computed(() => Math.max(920, viewportWidth.value, categories.value.length * categoryWidth.value + 120));
const step = computed(() => (width.value - 120) / Math.max(1, categories.value.length));
const barCenter = (index) => 100 + (index + 0.5) * step.value;
const barHeight = (entry) => Number(entry.amount) / Number(scale.value.maximum) * 260;
function switchMode(value) { mode.value = value; }
function closeProblems() { dialog.value?.close(); }
function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const elements = [...dialog.value.querySelectorAll('button, a[href]')];
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function restoreFocus() { problemButton.value?.focus(); }
async function openProblems() { await nextTick(); dialog.value.showModal(); }
function backdrop(event) {
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeProblems();
}
async function refresh(force = true) {
  if (loading.value) return;
  monthPicker.value?.close(); closeProblems(); kpiDialog.value?.close(); report.value = null; failed.value = false; loading.value = true;
  try {
    const response = await fetch(force ? '/api/report?refresh=1' : '/api/report', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const snapshot = await response.json();
    const available = roomOptions(snapshot.deals);
    if (!available.length || !selectedRooms.value.some(room => available.includes(room))) allRooms.value = true;
    selectedRooms.value = allRooms.value ? [...available] : reconcileRooms(availableRooms.value, selectedRooms.value, available);
    availableRooms.value = available;
    report.value = snapshot;
    updatePeriod();
    updatedAt.value = new Date(snapshot.updatedAt);
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
onMounted(() => refresh(false));
</script>

<template>
  <main class="px-3 pb-8 sm:px-8 sm:pb-14">
    <section aria-label="Գործարքների հաշվետվություն" class="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header class="report-header">
        <p class="report-header-label">Հաշվետվություններ</p>
        <h1>Կնքված բնակարանների հաշվետվություն</h1>
        <hr data-testid="header-divider" aria-hidden="true">
      </header>
      <div ref="filterContainer" class="filter-container">
      <form class="filter-panel" :class="{ 'filter-panel-unavailable': disabled, 'filter-panel-with-errors': hasFilterErrors, 'stacked-filters': stackedFilters, 'month-filter': selectedPeriod === 'month', 'quarter-filter': selectedPeriod === 'quarter' }" aria-label="Զտիչներ" @submit.prevent>
        <p v-if="disabled" class="filter-notice" role="status">Հաշվետվությունների թարմացման պատճառով զտիչների կարգավորումը ժամանակավորապես անհասանելի է։</p>
        <div v-show="!disabled" aria-label="Զտիչների տարածք">
          <div class="filter-heading">
            <h2><span class="filter-icon" :style="{ maskImage: `url(${filterIcon})` }" aria-hidden="true"></span>Զտիչներ</h2>
            <button type="button" :disabled="disabled" @click="resetFilters"><span class="filter-icon reset-icon" :style="{ maskImage: `url(${resetIcon})` }" aria-hidden="true"></span>Վերականգնել</button>
          </div>
          <div class="filter-row">
            <div class="filter-first-row">
            <fieldset class="date-filter" :disabled="disabled">
              <legend>{{ filterFields.date }}</legend>
              <div class="period-select">
              <select v-model="selectedPeriod" :aria-label="filterFields.date" @change="updatePeriod">
                <option v-for="[value, title] in periods" :key="value" :value="value">{{ title }}</option>
              </select>
              <span class="select-arrow" aria-hidden="true"></span>
              </div>
              <div v-if="selectedPeriod === 'quick'" class="period-details period-select">
                <select v-model="selectedQuick" aria-label="Արագ ընտրություն" @change="updatePeriod">
                  <option v-for="[value, title] in quickPeriods" :key="value" :value="value">{{ title }}</option>
                </select>
                <span class="select-arrow" aria-hidden="true"></span>
              </div>
              <div v-if="activeSelection" class="period-details">
                <div class="period-toolbar" :class="{ 'month-toolbar': selectedPeriod === 'month' }">
                  <div class="period-select">
                    <select v-model.number="activeSelection.year" aria-label="Տարի" @change="changePeriodYear">
                      <option v-for="year in periodContext.years" :key="year" :value="year">{{ year }}</option>
                    </select>
                    <span class="select-arrow" aria-hidden="true"></span>
                  </div>
                  <MonthPicker v-if="selectedPeriod === 'month'" ref="monthPicker" :months="months"
                    :values="activeSelection.values" :limit="availableMonths" :disabled="disabled"
                    @select="selectPeriodValue" @all="setAllMonths(false)" @clear="setAllMonths(true)" />
                </div>
                <div v-if="selectedPeriod === 'quarter'" class="period-buttons quarter-buttons" role="group" aria-label="Եռամսյակներ">
                  <button v-for="(title, index) in ['I', 'II', 'III', 'IV']" :key="index" type="button"
                    :aria-pressed="activeSelection.values.includes(index + 1)" :disabled="disabled || futurePeriod(index + 1)"
                    @click="selectPeriodValue(index + 1)">{{ title }}</button>
                </div>
              </div>
              <div v-show="selectedPeriod === 'custom'" class="custom-period">
                <RangeInputs :key="dateRevision" kind="date" :title="filterFields.date" :range="ranges.date"
                  @edit="(side, event) => editRange('date', side, event)" />
              </div>
            </fieldset>
            <fieldset :disabled="disabled">
              <legend>Համալիր</legend>
              <div class="complex-buttons">
                <button v-for="[value, title] in complexes" :key="value" type="button"
                  :aria-pressed="selectedComplexes.includes(value)" @click="toggleComplex(value)">{{ title }}</button>
              </div>
            </fieldset>
            <fieldset class="room-filter" :disabled="disabled">
              <legend>{{ fields.rooms }}</legend>
              <div class="room-buttons">
                <button class="all-rooms" type="button" :aria-pressed="allRooms"
                  @click="selectAllRooms">Բոլորը</button>
                <div class="room-values">
                  <template v-if="selectedPeriod === 'quarter'">
                    <div v-for="(row, index) in quarterRoomRows" :key="index" class="quarter-room-row">
                      <button v-for="room in row" :key="room" type="button"
                        :aria-pressed="!allRooms && selectedRooms.includes(room)" :aria-label="`${fields.rooms}՝ ${room}`"
                        @click="selectRoom(room)">{{ room }}</button>
                    </div>
                  </template>
                  <template v-else>
                    <button v-for="room in availableRooms" :key="room" type="button"
                      :aria-pressed="!allRooms && selectedRooms.includes(room)" :aria-label="`${fields.rooms}՝ ${room}`"
                      @click="selectRoom(room)">{{ room }}</button>
                  </template>
                </div>
              </div>
            </fieldset>
            </div>
            <div class="filter-second-row">
            <fieldset v-for="kind in ['area', 'amount']" :key="kind" :disabled="disabled" class="range-filter">
              <legend>{{ filterFields[kind] }}</legend>
              <RangeInputs :kind="kind" :title="filterFields[kind]" :range="ranges[kind]"
                @edit="(side, event) => editRange(kind, side, event)" />
            </fieldset>
            </div>
          </div>
        </div>
      </form>
      </div>
      <div class="kpi-container" :class="{ 'kpi-wide': wideKpi }" data-testid="kpi-container">
      <div class="kpi-grid">
        <KpiCard :wide="wideKpi" metric="count" title="Կնքված բնակարանների քանակ" :data="kpiData" :period="effectivePeriod.period"
          :loading="loading" :failed="failed" :reset-revision="kpiResetRevision" @open="(title, element) => kpiDialog.open(title, element)" />
        <KpiCard :wide="wideKpi" metric="amount" title="Վաճառքի ընդհանուր արժեք" :data="kpiData" :period="effectivePeriod.period"
          :loading="loading" :failed="failed" :reset-revision="kpiResetRevision" @open="(title, element) => kpiDialog.open(title, element)" />
      </div>
      <div v-if="!wideKpi && !disabled && kpiData" class="kpi-dates" data-testid="kpi-dates">
        <p>Ընտրված՝ {{ kpi.rangeText(kpiData.ranges.current) || 'Տվյալներ չկան' }}</p>
        <p v-if="kpiData.ranges.previous">Համեմատություն՝ {{ kpi.rangeText(kpiData.ranges.previous) }}</p>
      </div>
      </div>
      <div class="flex flex-col items-center gap-3 border-b border-slate-100 px-3 py-5 sm:px-6">
        <p class="text-sm font-medium text-slate-600">Ցուցադրություն</p>
        <div role="group" aria-label="Խմբավորում" class="flex max-w-full rounded-xl bg-slate-100 p-1">
          <button v-for="item in ['rooms', 'months']" :key="item" type="button"
            :aria-pressed="mode === item" @click="switchMode(item)"
            class="rounded-lg px-3 py-2.5 text-xs font-medium transition-colors sm:px-5 sm:text-sm"
            :class="mode === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-blue-700'">
            {{ fields[item === 'rooms' ? 'rooms' : 'date'] }}
          </button>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-6 sm:px-8">
        <h2 class="text-sm font-medium">Y · Ընդհանուր արժեք (֏)</h2>
        <button type="button" class="refresh-button"
          :disabled="loading" @click="refresh">Թարմացնել հաշվետվությունը</button>
      </div>
      <div v-if="loading" role="status" aria-label="Գծապատկերի վիճակ" class="flex min-h-96 items-center justify-center p-8 text-center text-slate-500">Տվյալները բեռնվում են…</div>
      <div v-else-if="failed" role="alert" class="flex min-h-96 items-center justify-center p-8 text-center text-red-700">Չհաջողվեց բեռնել տվյալները։ Փորձեք կրկին։</div>
      <template v-else-if="report">
        <p v-if="!hasData" role="status" aria-label="Գծապատկերի վիճակ" class="pt-6 text-center text-slate-500">Տվյալներ չկան</p>
        <div :ref="observeViewport" class="overflow-x-auto px-2 pt-4" aria-label="Գծապատկերի տարածք" tabindex="0">
          <svg v-if="categories.length" :viewBox="`0 0 ${width} 380`" :style="{ minWidth: `${width}px` }" class="block w-full" role="group" :aria-label="axisTitle">
            <g v-for="(tick, index) in scale.ticks" :key="index" data-testid="y-tick">
              <line x1="100" :x2="width - 20" :y1="310 - index * 65" :y2="310 - index * 65"
                :stroke="index === 0 ? '#94a3b8' : '#e5eaf2'" :stroke-dasharray="index === 0 ? undefined : '4 4'" />
              <text x="86" :y="315 - index * 65" text-anchor="end" font-size="12" fill="#64748b">{{ shortAmount(tick) }}</text>
            </g>
            <line x1="100" x2="100" y1="310" y2="50" stroke="#94a3b8" data-testid="y-axis" />
            <g v-for="(entry, index) in categories" :key="entry.category" class="chart-column" role="img" tabindex="0"
              :aria-label="`${label(entry)}՝ ${fullAmount(entry.amount)} AMD, ${entry.count} գործարք`">
              <rect :x="barCenter(index) - barWidth / 2" :y="310 - barHeight(entry)" :width="barWidth" :height="barHeight(entry)" rx="4" fill="#6685EB" />
              <text :x="barCenter(index)" :y="298 - barHeight(entry)" text-anchor="middle" font-size="12" fill="#6685EB" data-testid="bar-amount">{{ fullAmount(entry.amount) }} ֏</text>
              <text :x="barCenter(index)" y="338" text-anchor="middle" font-size="12" fill="#475569">{{ label(entry) }}</text>
              <text :x="barCenter(index)" y="360" text-anchor="middle" font-size="12" fill="#64748b" data-testid="bar-count">{{ entry.count }} գործարք</text>
            </g>
          </svg>
          <div v-else class="py-24" aria-hidden="true"></div>
        </div>
        <footer class="border-t border-slate-100 px-4 py-5 sm:px-6">
          <div class="chart-footer-info text-xs text-slate-500">
            <p class="chart-summary" aria-live="polite">Թարմացվել է՝ <time :datetime="updatedAt.toISOString()">{{ updatedTime(updatedAt) }}</time> · <span data-testid="total-count">Գործարքների քանակ՝ {{ totalCount }}</span></p>
            <p class="chart-x-title">{{ axisTitle }} · Գործարքների քանակ · X</p>
          </div>
          <div v-if="report.problems.length" class="mt-4 flex justify-end">
            <button ref="problemButton" type="button" @click="openProblems"
              class="rounded-lg bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-900 hover:bg-amber-100 sm:text-sm">
              Խնդրահարույց գործարքներ <span class="ml-2 rounded-md bg-white px-2 py-1">{{ report.problems.length }}</span>
            </button>
          </div>
        </footer>
      </template>
    </section>
    <KpiDealsDialog ref="kpiDialog" :data="kpiData" :unavailable="disabled" />
    <dialog ref="dialog" aria-labelledby="problems-title" @click="backdrop" @close="restoreFocus" @keydown="trapFocus"
      class="fixed inset-0 m-auto max-h-[80vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-xl">
      <div class="sticky top-0 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5">
        <h2 id="problems-title" class="text-base font-semibold sm:text-lg">Խնդրահարույց գործարքներ</h2>
        <button type="button" aria-label="Փակել" autofocus @click="closeProblems" class="rounded-md px-3 py-1 text-2xl hover:bg-slate-100">×</button>
      </div>
      <ul class="divide-y divide-slate-100 px-5">
        <li v-for="problem in report?.problems || []" :key="problem.id" class="flex gap-5 py-4 text-sm">
          <a :href="problem.url" target="_blank" rel="noopener noreferrer" class="shrink-0 font-semibold text-blue-700 underline underline-offset-4">{{ problem.id }}</a>
          <div class="space-y-1"><p v-for="reason in problem.reasons" :key="reason.field">{{ fields[reason.field] }}՝ {{ reasons[reason.code] }}</p></div>
        </li>
      </ul>
    </dialog>
  </main>
</template>
