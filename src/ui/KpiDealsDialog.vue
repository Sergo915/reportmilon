<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import kpi from '../report/kpi.cjs';
const props = defineProps({ data: Object, unavailable: Boolean });
const dialog = ref(null), title = ref(''), period = ref('current'), page = ref(1);
let opener;
const rows = computed(() => kpi.detailRows(props.data?.selected[period.value] || []));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 50)));
const visible = computed(() => rows.value.slice((page.value - 1) * 50, page.value * 50));
const total = computed(() => props.data?.[period.value]);
const dates = computed(() => kpi.rangeText(props.data?.ranges[period.value]) || 'Տվյալներ չկան');
const dateText = value => value.split('-').reverse().join('.');
watch(period, () => { page.value = 1; });
watch(() => props.unavailable, value => { if (value) close(); });
async function open(name, element) {
  if (props.unavailable || !props.data) return;
  opener = element; title.value = name; period.value = 'current'; page.value = 1;
  await nextTick(); dialog.value.showModal();
}
function close() {
  if (!dialog.value?.open) return;
  dialog.value.close();
  // Restore synchronously: a queued close event must not steal focus from the
  // next control the user selects after dismissing the dialog.
  opener?.focus();
}
function backdrop(event) {
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
}
function trap(event) {
  if (event.key !== 'Tab') return;
  const nodes = [...dialog.value.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
  const first = nodes[0], last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
defineExpose({ open, close });
</script>

<template>
  <dialog ref="dialog" class="kpi-dialog" aria-labelledby="kpi-details-title" @click="backdrop" @cancel.prevent="close" @keydown="trap">
    <header class="kpi-dialog-header">
      <h2 id="kpi-details-title">{{ title }}</h2>
      <button type="button" aria-label="Փակել" autofocus @click="close">×</button>
    </header>
    <div class="kpi-dialog-body">
      <div v-if="data?.previous" class="kpi-types" role="group" aria-label="Գործարքների ժամանակահատված">
        <button v-for="[key, label] in [['current', 'Ընտրված'], ['previous', 'Համեմատություն']]" :key="key"
          type="button" :aria-pressed="period === key" @click="period = key">{{ label }}</button>
      </div>
      <p class="kpi-dialog-dates">{{ dates }}</p>
      <div class="kpi-dialog-totals" aria-live="polite">
        <p>Կնքված բնակարաններ՝ <strong>{{ total?.count ?? 0 }}</strong></p>
        <p>Վաճառքի ընդհանուր արժեք՝ <strong>{{ kpi.valueText(total?.amount ?? '0', 'amount') }}</strong></p>
      </div>
      <div v-if="rows.length" class="kpi-table-scroll" tabindex="0" role="region" aria-label="Գործարքների աղյուսակ">
        <table>
          <thead><tr><th>Կնքման ամսաթիվ</th><th>Համալիր</th><th>Սենյակների քանակ</th><th>Մակերես (մ²)</th><th>Ընդհանուր արժեք</th><th>Գործարք</th></tr></thead>
          <tbody><tr v-for="row in visible" :key="row.id">
            <td>{{ dateText(row.date) }}</td><td>{{ row.complex === 'tower' ? 'Թաուեր' : row.complex === 'hills' ? 'Հիլլս' : '—' }}</td>
            <td>{{ row.rooms }}</td><td>{{ row.area }}</td><td>{{ kpi.valueText(row.amount, 'amount') }}</td>
            <td><a :href="row.url" target="_blank" rel="noopener noreferrer">Բացել գործարքը</a></td>
          </tr></tbody>
        </table>
      </div>
      <p v-else class="kpi-notice" role="status">Տվյալներ չկան</p>
      <nav v-if="pages > 1" class="kpi-pagination" aria-label="Գործարքների էջեր">
        <button type="button" :disabled="page === 1" @click="page--">Նախորդ</button>
        <span aria-live="polite">{{ page }} / {{ pages }}</span>
        <button type="button" :disabled="page === pages" @click="page++">Հաջորդ</button>
      </nav>
    </div>
  </dialog>
</template>
