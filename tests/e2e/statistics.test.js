const {createServer}=require('../../server.js');
const {createFixture,deal}=require('../support/crm-fixture.cjs');
let server,url,fixture;
beforeEach(async()=>{await page.clock.setFixedTime(new Date('2026-11-15T10:00:00Z'));fixture=createFixture({items:[1,2,3,4].map((id,i)=>deal(id,{ufCrmRooms:[1,2,2,3][i],ufCrmArea:String([15,20,30,40][i]),ufCrmDate:`2026-0${Math.min(id,3)}-10`,opportunity:String(i===3?110000000:30000000),ufCrmComplex:i===3?'82':'81'}))});server=createServer(fixture);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;});
afterEach(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
test('statistics selection, counts, filtering, reset and responsive layout',async()=>{await page.setViewportSize({width:1920,height:1200});let requests=0;page.on('request',r=>{if(r.url().includes('/api/report'))requests++;});await page.goto(url);await page.getByTestId('statistics-count').waitFor();const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});await expectValue('4');
const filter=page.getByRole('form',{name:'Զտիչներ',exact:true});
const boxes=await Promise.all([filter.boundingBox(),panel.boundingBox(),page.getByTestId('kpi-container').boundingBox()]);
expect(Math.abs((await page.locator('.report-top-panels').boundingBox()).x-boxes[2].x)).toBeLessThan(1);
const frame=await page.locator('.report-top-panels').boundingBox();expect(Math.abs(frame.x+frame.width-boxes[2].x-boxes[2].width)).toBeLessThan(1);
expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThan(1);
expect(boxes[0].height).toBe(258);expect(boxes[1].height).toBe(258);
await page.screenshot({path:'test-results/statistics-wide.png',fullPage:true});
expect(await panel.getByRole('button',{name:'Ըստ՝ տարի',exact:true}).isVisible()).toBe(true);await panel.getByRole('button',{name:'Ըստ՝ տարի',exact:true}).hover();const popup=page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'});await popup.getByRole('button',{name:'Համալիր',exact:true}).click();expect(await panel.locator('.statistics-legend').innerText()).toContain('75%');expect(await popup.isVisible()).toBe(false);await page.getByRole('form',{name:'Զտիչներ',exact:true}).getByRole('button',{name:'Հիլլս',exact:true}).click();await expectValue('3');expect(await panel.locator('.statistics-legend').innerText()).toContain('100%');expect(requests).toBe(1);for(const width of [1920,1024,375]){await page.setViewportSize({width,height:1200});await page.waitForTimeout(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await page.getByRole('button',{name:'Վերականգնել',exact:true}).click();await expectValue('4');expect(await panel.getByRole('button',{name:'Ըստ՝ տարի',exact:true}).isVisible()).toBe(true);await page.screenshot({path:'test-results/statistics-narrow.png',fullPage:true});async function expectValue(v){await page.waitForFunction(value=>document.querySelector('[data-testid=statistics-count]')?.textContent===value,v);}});

test('all grouping options, calendar mapping and keyboard tooltip work locally',async()=>{
 await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 const button=()=>panel.locator('.statistics-trigger');
 const popup=page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'});
 for(const [label,expected] of [['Սենյակ','50%'],['Մակերես','20–30'],['Բն. Արժեք','30 մլն–40 մլն']]){
  await button().focus();await page.keyboard.press('Enter');await popup.waitFor();
  expect(await popup.getByRole('button').count()).toBe(5);
  await popup.getByRole('button',{name:label,exact:true}).click();
  expect(await panel.locator('.statistics-legend').innerText()).toContain(expected);
  await panel.locator('svg g').first().focus();expect(await panel.getByRole('tooltip').innerText()).toContain('%');
 }
 const period=page.getByRole('combobox',{name:'Կնքման ժամանակահատված',exact:true});
 for(const [value,title] of [['month','Կնքման ամիս'],['quarter','Կնքման եռամսյակ'],['year','Կնքման տարի'],['custom','Կնքման ամիս'],['quick','Կնքման ամիս']]){
  await period.selectOption(value);await button().click();await popup.waitFor();
  expect(await popup.getByRole('button').first().innerText()).toBe(title);
  await page.keyboard.press('Escape');expect(await button().evaluate(e=>document.activeElement===e)).toBe(true);
 }
});
test('loading, failure, recovery, empty result and refresh preserve selected grouping',async()=>{
 let release;fixture.state.gate=new Promise(resolve=>{release=resolve;});
 await page.goto(url);const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 expect(await panel.locator('.statistics-trigger').isDisabled()).toBe(true);
 expect(await panel.getByTestId('statistics-count').count()).toBe(0);release();fixture.state.gate=null;
 await page.getByTestId('statistics-count').waitFor();await panel.locator('.statistics-trigger').click();
 await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Մակերես',exact:true}).click();
 fixture.state.failPage=0;await page.getByRole('button',{name:'Թարմացնել հաշվետվությունը',exact:true}).click();
 await panel.getByText('Տվյալներն անհասանելի են։',{exact:true}).waitFor();
 expect(await panel.locator('svg').count()).toBe(0);expect(await panel.locator('.statistics-trigger').isDisabled()).toBe(true);
 fixture.state.failPage=undefined;fixture.state.items=[];
 await page.getByRole('button',{name:'Թարմացնել հաշվետվությունը',exact:true}).click();
 await panel.getByText('Տվյալներ չկան',{exact:true}).waitFor();
 expect(await panel.getByTestId('statistics-count').innerText()).toBe('0');
 expect(await panel.getByTestId('statistics-amount').innerText()).toBe('0 ֏');
 expect(await panel.locator('.statistics-trigger').innerText()).toBe('Ըստ՝ մակերես');
 expect(await panel.locator('.statistics-trigger').isEnabled()).toBe(true);
});

test('joined frame, spacing, centered 12px labels and distinct room colors',async()=>{
 await page.setViewportSize({width:1920,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const geometry=await page.evaluate(()=>{const form=document.querySelector('.filter-panel'),stats=document.querySelector('.statistics-panel');const a=form.querySelector('h2').getBoundingClientRect(),b=form.querySelector('legend').getBoundingClientRect(),c=stats.querySelector('h2').getBoundingClientRect(),d=stats.querySelector('article').getBoundingClientRect();return {left:b.top-a.bottom,right:d.top-c.bottom,divider:getComputedStyle(document.querySelector('.report-top-panels'),'::after').width,font:getComputedStyle(stats.querySelector('h3')).fontSize,align:getComputedStyle(stats.querySelector('article')).textAlign};});
 expect(Math.abs(geometry.left-geometry.right)).toBeLessThan(1);expect(geometry.divider).toBe('1px');expect(geometry.font).toBe('12px');expect(geometry.align).toBe('center');
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});await panel.locator('.statistics-trigger').click();await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Սենյակ',exact:true}).click();
 const legend=await panel.locator('.statistics-legend').innerText();for(const n of [1,2,3])expect(legend).toContain(`${n} սենյակ`);
 const colors=await panel.locator('svg path').evaluateAll(elements=>elements.map(e=>e.getAttribute('fill')));expect(new Set(colors).size).toBe(3);
 await page.screenshot({path:'test-results/statistics-joined-wide.png',fullPage:true});
});
test('adaptive equal input widths, equal cards, matching pie extent and shared legend tracks',async()=>{
 await page.setViewportSize({width:1920,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const panel=page.getByRole('region',{name:'Վիճակագրություն',exact:true});
 const a=await panel.locator('article').first().boundingBox(),b=await panel.locator('article').last().boundingBox(),pie=await panel.locator('.statistics-pie').boundingBox();
 expect(a.width).toBe(b.width);expect(Math.abs(a.height-b.height)).toBeLessThan(1);
 expect(Math.abs(pie.y-a.y)).toBeLessThan(1);expect(Math.abs(pie.y+pie.height-b.y-b.height)).toBeLessThan(1);
 const end=await page.locator('#amount-max').boundingBox();expect(Math.abs(end.y+end.height-b.y-b.height)).toBeLessThan(1);
 const inputWidth=(await page.locator('#area-min').boundingBox()).width;
 for(const id of ['area-min','area-max','amount-min','amount-max'])expect((await page.locator(`#${id}`).boundingBox()).width).toBe(inputWidth);
 expect(await panel.locator('article').last().locator('h3 br').count()).toBe(1);
 await panel.locator('.statistics-trigger').click();await page.getByRole('dialog',{name:'Վիճակագրության խմբավորում'}).getByRole('button',{name:'Բն. Արժեք',exact:true}).click();
 expect(await panel.locator('.statistics-trigger').innerText()).toBe('Ըստ՝ բն. արժեք');expect(await panel.locator('.statistics-legend').innerText()).toContain('30 մլն–40 մլն');
 const positions=await panel.locator('.statistics-legend li').evaluateAll(rows=>rows.map(row=>[...row.children].map(el=>el.getBoundingClientRect().right)));
 for(let i=1;i<positions.length;i++)for(const col of [0,2,3])expect(Math.abs(positions[i][col]-positions[0][col])).toBeLessThan(1);
 await page.screenshot({path:'test-results/statistics-fixed-fields.png',fullPage:true});
});
test.each([1440,1920])('desktop keeps equal halves with statistics on the right at %i',async width=>{
 await page.setViewportSize({width,height:1200});await page.goto(url);await page.getByTestId('statistics-count').waitFor();
 const filter=await page.locator('.filter-panel').boundingBox(),stats=await page.locator('.statistics-panel').boundingBox();
 expect(Math.abs(filter.width-stats.width)).toBeLessThan(1);expect(Math.abs(filter.y-stats.y)).toBeLessThan(1);expect(Math.abs(stats.x-filter.x-filter.width)).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/statistics-right-${width}.png`,fullPage:true});
});
