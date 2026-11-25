export function startQaAccountSwitch(liff,storage,redirectUri) {
  liff.logout();
  storage.setItem('mmd-qa-liff-return','1');
  liff.login({redirectUri});
}

export function patchQaAccountSwitch(source) {
  const marker='sdkReady.then(() => {';
  if (source.split(marker).length !== 2) throw Error('QA UI revision differs');
  const branch='\n  if(new URLSearchParams(location.search).get("switch_line")==="1") {\n    ('+
    startQaAccountSwitch.toString()+')(liff,sessionStorage,qaLoginRedirect());\n    return;\n  }';
  return source.replace(marker,marker+branch);
}
