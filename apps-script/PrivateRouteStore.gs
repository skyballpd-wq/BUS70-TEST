/*
 * Private route-data boundary.
 *
 * Production data is supplied by an untracked RoutePrivateData.js file or by
 * Script Properties. Public source files must contain no real driver roster,
 * employee identifier, dated dispatch board, exact timetable, or GPS point.
 */

function bus70PrivateData_() {
  let data=null;
  if(typeof BUS70_PRIVATE_ROUTE_DATA_!=='undefined'&&BUS70_PRIVATE_ROUTE_DATA_)data=BUS70_PRIVATE_ROUTE_DATA_;
  if(!data){
    try{
      const text=PropertiesService.getScriptProperties().getProperty('BUS70_PRIVATE_ROUTE_DATA_JSON');
      if(text)data=JSON.parse(text);
    }catch(error){data=null;}
  }
  return data;
}

function bus70PrivateRouteSource_(rawRoute, rawDate) {
  const route=String(rawRoute||'').replace(/\D/g,''),date=normalizeDate_(rawDate);
  if(!route||!date)return null;
  const data=bus70PrivateData_();
  const source=data&&data[route]&&data[route][date];
  return source?JSON.parse(JSON.stringify(source)):null;
}

function bus70PrivateConfig_() {
  const data=bus70PrivateData_(),embedded=data&&data.config&&typeof data.config==='object'?data.config:{};
  let shiftAnchorDate=String(embedded.shiftAnchorDate||''),shiftAnchor=String(embedded.shiftAnchor||'').toUpperCase();
  try{
    const properties=PropertiesService.getScriptProperties();
    shiftAnchorDate=String(properties.getProperty('BUS70_SHIFT_ANCHOR_DATE')||shiftAnchorDate);
    shiftAnchor=String(properties.getProperty('BUS70_SHIFT_ANCHOR_SHIFT')||shiftAnchor).toUpperCase();
  }catch(error){}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(shiftAnchorDate)||['A','B'].indexOf(shiftAnchor)===-1)return null;
  return {shiftAnchorDate:shiftAnchorDate,shiftAnchor:shiftAnchor};
}

function bus70PrivateBootstrapAccounts_() {
  const data=bus70PrivateData_(),embedded=data&&data.config&&Array.isArray(data.config.bootstrapAccounts)?data.config.bootstrapAccounts:[];
  let accounts=embedded;
  try{
    const text=PropertiesService.getScriptProperties().getProperty('BUS70_BOOTSTRAP_ACCOUNTS_JSON');
    if(text)accounts=JSON.parse(text);
  }catch(error){accounts=[];}
  if(!Array.isArray(accounts))return [];
  return accounts.map(function(account){return {
    accountId:String(account&&account.accountId||''),role:String(account&&account.role||''),driverId:String(account&&account.driverId||''),
    loginName:String(account&&account.loginName||''),initialPassword:String(account&&account.initialPassword||''),note:String(account&&account.note||''),route:String(account&&account.route||'')
  };}).filter(function(account){return account.accountId&&['마스터','소장','정비소'].indexOf(account.role)!==-1&&account.driverId&&account.loginName&&account.initialPassword.length>=5;});
}

function bus70PrivateDriverOnlyIds_() {
  const data=bus70PrivateData_(),embedded=data&&data.config&&Array.isArray(data.config.driverOnlyIds)?data.config.driverOnlyIds:[];
  let ids=embedded;
  try{
    const text=PropertiesService.getScriptProperties().getProperty('BUS70_DRIVER_ONLY_IDS');
    if(text)ids=text.split(',');
  }catch(error){ids=[];}
  return (Array.isArray(ids)?ids:[]).map(function(value){return String(value||'').trim();}).filter(Boolean);
}

function bus70PrivateVirtualDriverId_(route, sequence) {
  return 'R'+String(route||'').replace(/\D/g,'')+'-TMP-'+('00'+Number(sequence||0)).slice(-3);
}

function bus70PrivateRouteStatus_() {
  const routes={};
  let source='NONE';
  if(typeof BUS70_PRIVATE_ROUTE_DATA_!=='undefined'&&BUS70_PRIVATE_ROUTE_DATA_)source='LOCAL_PRIVATE_MODULE';
  else{try{if(PropertiesService.getScriptProperties().getProperty('BUS70_PRIVATE_ROUTE_DATA_JSON'))source='SCRIPT_PROPERTY';}catch(error){}}
  const data=bus70PrivateData_();
  Object.keys(data||{}).filter(function(route){return /^\d+$/.test(route);}).forEach(function(route){routes[route]=Object.keys(data[route]||{}).sort();});
  return {configured:Boolean(data&&bus70PrivateConfig_()),source:source,routes:routes,shiftConfigured:Boolean(bus70PrivateConfig_()),bootstrapAccountsConfigured:bus70PrivateBootstrapAccounts_().length>0,driverOnlyIdsConfigured:bus70PrivateDriverOnlyIds_().length>0};
}
