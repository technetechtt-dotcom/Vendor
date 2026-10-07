import type {Metadata,Viewport} from 'next';import './globals.css';
import {PwaRegister} from './pwa-register';
export const metadata:Metadata={title:'Sol Plaatje · Vendor Register',description:'Local Economic Development Office vendor register, hub allocations, fees and compliance.',applicationName:'Sol Plaatje Vendor Register',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Vendor Register',statusBarStyle:'default'},icons:{icon:[{url:'/icon-192.png',sizes:'192x192',type:'image/png'},{url:'/favicon.svg',type:'image/svg+xml'}],apple:'/icon-192.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#143c35'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<PwaRegister/></body></html>}
