import React from 'react';

export function FieldSelect({value,onChange,label,options,boolean,t}:{value:string;onChange:(value:string)=>void;label?:string;options?:string[];boolean:boolean;t:(source:string)=>string}) {
  return <select aria-label={label} value={value} onChange={event=>onChange(event.target.value)}><option value="">—</option>{(boolean?['true','false']:options??[]).map(id=><option key={id} value={id}>{boolean?t(id==='true'?'Verdadero':'Falso'):id}</option>)}</select>;
}
