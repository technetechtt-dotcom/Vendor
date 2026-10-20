'use client';
import {useEffect,useState} from 'react';

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function PwaRegister(){
  const [install,setInstall]=useState<InstallEvent|null>(null);
  useEffect(()=>{
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const offer=(e:Event)=>{e.preventDefault();if('prompt' in e)setInstall(e as InstallEvent)};
    window.addEventListener('beforeinstallprompt',offer);
    return()=>window.removeEventListener('beforeinstallprompt',offer);
  },[]);
  if(!install)return null;
  return <button className="pwa-install" type="button" onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null)}}>Install register</button>;
}
