'use client';
import {useEffect,useState} from 'react';

export function PwaRegister(){
  const [install,setInstall]=useState<any>(null);
  useEffect(()=>{
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const offer=(e:Event)=>{e.preventDefault();setInstall(e)};
    window.addEventListener('beforeinstallprompt',offer);
    return()=>window.removeEventListener('beforeinstallprompt',offer);
  },[]);
  if(!install)return null;
  return <button className="pwa-install" type="button" onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null)}}>Install register</button>;
}
