<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import model from '../report/statistics.cjs';
import kpi from '../report/kpi.cjs';
import icon from '../../images/statistics.png';
const props=defineProps({ deals:Array, filters:Object, period:String, loading:Boolean, failed:Boolean, resetRevision:Number });
const selected=ref('time'), popup=ref(null), trigger=ref(null), open=ref(false), tip=ref(null), money=ref(false);
const type=computed(()=>selected.value==='time'?model.timeType(props.period):selected.value);
const short={month:'Ամիս',quarter:'Եռամսյակ',year:'Տարի',complex:'Համալիր',rooms:'Սենյակ',area:'Մակերես',amount:'Բն. Արժեք'};
const options=computed(()=>[['time',`Կնքման ${{month:'ամիս',quarter:'եռամսյակ',year:'տարի'}[model.timeType(props.period)]}`],['complex','Համալիր'],['rooms','Սենյակ'],['area','Մակերես'],['amount','Բն. Արժեք']]);
const data=computed(()=>model.statistics(props.deals||[],props.filters,type.value));
const disabled=computed(()=>props.loading||props.failed);
const slices=computed(()=>{let start=0; return data.value.rows.map(row=>{ const end=start+row.share*2*Math.PI; const x=a=>100+90*Math.sin(a),y=a=>100-90*Math.cos(a); const path=`M100 100 L${x(start)} ${y(start)} A90 90 0 ${row.share>.5?1:0} 1 ${x(end)} ${y(end)} Z`; start=end;return {...row,path}; });});
function close(restore=false){ if(open.value) popup.value?.hidePopover();open.value=false;if(restore)trigger.value?.focus(); }
function position(){if(!open.value)return;const r=trigger.value.getBoundingClientRect(),p=popup.value; p.style.left=`${Math.max(12,Math.min(r.right-p.offsetWidth,innerWidth-p.offsetWidth-12))}px`;p.style.top=`${Math.max(12,r.bottom+p.offsetHeight>innerHeight?r.top-p.offsetHeight:r.bottom)}px`;}
async function show(){if(disabled.value||open.value)return;open.value=true;await nextTick();if(!open.value)return;popup.value.showPopover();position();}
function leave(e){if(e.pointerType==='mouse'&&!trigger.value?.contains(e.relatedTarget)&&!popup.value?.contains(e.relatedTarget))close();}
function outside(e){if(!trigger.value?.contains(e.target)&&!popup.value?.contains(e.target))close(); if(!e.target.closest('.statistics-money'))money.value=false;}
function key(e){if(e.key==='Escape'&&open.value){e.preventDefault();close(true);}}
watch(()=>props.resetRevision,()=>{selected.value='time';close();});
watch(disabled,v=>{if(v){close();tip.value=null;money.value=false;}});
watch(data,()=>{tip.value=null;});
onMounted(()=>{document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);});
</script>
<template>
<section class="statistics-panel" aria-label="Վիճակագրություն" :aria-busy="loading">
 <div class="filter-heading statistics-heading"><h2><span class="filter-icon" :style="{maskImage:`url(${icon})`}" aria-hidden="true"></span>Վիճակագրություն</h2>
 <button ref="trigger" class="statistics-trigger" type="button" :disabled="disabled" :aria-expanded="open" aria-controls="statistics-popup" aria-haspopup="dialog" @pointerenter="e=>{if(e.pointerType==='mouse')show()}" @pointerleave="leave" @click="show">Ըստ՝ {{short[type].toLocaleLowerCase('hy-AM')}}</button></div>
 <div ref="popup" id="statistics-popup" popover="manual" role="dialog" aria-label="Վիճակագրության խմբավորում" class="month-popup statistics-popup" @pointerleave="leave">
 <button v-for="[value,label] in options" :key="value" type="button" :aria-pressed="selected===value" @click="selected=value;close(true)">{{label}}</button></div>
 <p v-if="disabled" class="statistics-status" role="status">{{failed?'Տվյալներն անհասանելի են։':'Տվյալները բեռնվում են…'}}</p>
 <div v-else class="statistics-body">
 <div class="statistics-totals"><article><h3>Կնքված բնակարանների քանակ</h3><p data-testid="statistics-count">{{data.count}}</p></article><article><h3>Վաճառքի ընդհանուր<br>արժեք</h3><div class="statistics-money"><span tabindex="0" aria-describedby="statistics-money-tip" @mouseenter="money=true" @mouseleave="money=false" @focus="money=true" @blur="money=false" @click="money=true" data-testid="statistics-amount">{{kpi.compactAmount(data.amount)}}</span><span v-if="money" id="statistics-money-tip" role="tooltip">{{kpi.fullKpiAmount(data.amount)}}</span></div></article></div>
 <template v-if="data.count"><div class="statistics-pie"><svg viewBox="10 10 180 180" aria-label="Բնակարանների բաշխում"><g v-for="row in slices" :key="row.key" tabindex="0" role="img" :aria-label="`${row.label}՝ ${row.count}, ${row.percent}`" @mouseenter="tip=row" @mouseleave="tip=null" @focus="tip=row" @blur="tip=null"><circle v-if="slices.length===1" cx="100" cy="100" r="90" :fill="row.color"/><path v-else :d="row.path" :fill="row.color"/></g></svg><p v-if="tip" role="tooltip">{{tip.label}}՝ {{tip.count}}, {{tip.percent}}</p></div>
 <ul class="statistics-legend" tabindex="0" aria-label="Վիճակագրության բացատրություն"><li v-for="row in data.rows" :key="row.key"><i :style="{background:row.color}" aria-hidden="true"></i><span>{{row.label}}</span><b>{{row.count}}</b><span>{{row.percent}}</span></li></ul></template>
 <p v-else role="status">Տվյալներ չկան</p>
 </div>
</section>
</template>
