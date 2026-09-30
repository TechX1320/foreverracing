<?php
declare(strict_types=1);

final class PowerModel
{
    public static function suggestedPowerLimits(array $engine, float $baseHp = 0): array
    {
        $hp = max(1.0, $baseHp > 0 ? $baseHp : (float)($engine['peakHp'] ?? 200));
        $disp = max(0.5, (float)($engine['displacementLiters'] ?? 2));
        $config = strtolower((string)($engine['configuration'] ?? ''));
        $asp = strtolower((string)($engine['aspiration'] ?? ''));
        $rotary = str_contains($config, 'rotary');
        $diesel = str_contains($asp, 'diesel');
        $boosted = str_contains($asp, 'turbo') || str_contains($asp, 'super');

        if ($rotary) $max = max($hp * 4.2, $disp * 760);
        elseif ($diesel) $max = max($hp * 2.8, $disp * 230);
        elseif ($boosted) $max = max($hp * 3.1, $disp * 340);
        else $max = max($hp * 3.25, $disp * 300);

        $max = self::clamp($max, $hp * 1.8, 2800);
        $stock = max($hp * 1.35, $max * 0.38);
        return [
            'stockHp'=>(int)round($stock),
            'kit1Hp'=>(int)round(max($stock,$max*0.54)),
            'kit2Hp'=>(int)round(max($stock,$max*0.69)),
            'kit3Hp'=>(int)round(max($stock,$max*0.84)),
            'kit4Hp'=>(int)round($max),
        ];
    }

    public static function normalizePowerLimits(array $engine, float $baseHp = 0): array
    {
        $src = is_array($engine['powerLimits'] ?? null) ? $engine['powerLimits'] : [];
        $fallback = self::suggestedPowerLimits($engine,$baseHp);
        $v = [
            'stockHp'=>self::positive($src['stockHp'] ?? $src['stock'] ?? $fallback['stockHp']),
            'kit1Hp'=>self::positive($src['kit1Hp'] ?? $src['kit1'] ?? $fallback['kit1Hp']),
            'kit2Hp'=>self::positive($src['kit2Hp'] ?? $src['kit2'] ?? $fallback['kit2Hp']),
            'kit3Hp'=>self::positive($src['kit3Hp'] ?? $src['kit3'] ?? $fallback['kit3Hp']),
            'kit4Hp'=>self::positive($src['kit4Hp'] ?? $src['kit4'] ?? $src['maxHp'] ?? $fallback['kit4Hp']),
        ];
        $v['stockHp']=max($v['stockHp'],max(1,$baseHp>0?$baseHp:(float)($engine['peakHp']??1)));
        $v['kit1Hp']=max($v['stockHp'],$v['kit1Hp']);
        $v['kit2Hp']=max($v['kit1Hp'],$v['kit2Hp']);
        $v['kit3Hp']=max($v['kit2Hp'],$v['kit3Hp']);
        $v['kit4Hp']=max($v['kit3Hp'],$v['kit4Hp']);
        return array_map(fn($n): int => (int) round($n), $v);
    }

    public static function enginePowerEnvelope(array $car, array $specs): array
    {
        $engine = is_array($car['engine'] ?? null) ? $car['engine'] : [];
        $baseHp=max(1,(float)($car['base']['hp'] ?? $engine['peakHp'] ?? 1));
        $baseTq=max(1,(float)($car['base']['torque'] ?? $engine['peakTorque'] ?? 1));
        $limits=self::normalizePowerLimits($engine,$baseHp);
        $level=0;
        foreach($specs as $part)$level=max($level,(int)($part['engineKit']['level']??0));
        $key=$level>=4?'kit4Hp':($level===3?'kit3Hp':($level===2?'kit2Hp':($level===1?'kit1Hp':'stockHp')));
        $capacity=(float)$limits[$key];

        $reinforcement=self::structuralSupportScore($specs);
        if($reinforcement>0 && $level<4){
            $nextKey=$level>=3?'kit4Hp':($level===2?'kit3Hp':($level===1?'kit2Hp':'kit1Hp'));
            $next=(float)$limits[$nextKey];
            $capacity += ($next-$capacity)*min(0.35,$reinforcement*0.08);
        }
        $ratio=max(1,$capacity/$baseHp);
        $capacityTq=max($baseTq*1.35,$baseTq*$ratio*1.08);
        return [
            'engineKitLevel'=>$level,
            'limits'=>$limits,
            'capacityHp'=>(int)round($capacity),
            'capacityTorque'=>(int)round($capacityTq),
            'softStartHp'=>(int)round($capacity*0.82),
            'softStartTorque'=>(int)round($capacityTq*0.82),
        ];
    }

    public static function applyBuildPartEffect(array &$stats,array $effect,array $part): void
    {
        $stat=(string)($effect['stat']??'');
        if(!array_key_exists($stat,$stats))return;
        $value=(float)($effect['value']??0);
        $op=(string)($effect['op']??'add');
        $scale=self::powerEffectScale($part,$stat);
        if(($stat==='hp'||$stat==='torque') && $scale<=0)return;
        if($op==='mul'){
            $mult=($stat==='hp'||$stat==='torque') ? 1+(($value-1)*$scale) : $value;
            $stats[$stat]*=$mult;
        }else{
            $stats[$stat]+=($stat==='hp'||$stat==='torque')?$value*$scale:$value;
        }
    }

    public static function powerEffectScale(array $part,string $stat): float
    {
        if($stat!=='hp'&&$stat!=='torque')return 1;
        $explicit=$part['powerModel']['effectScale']??$part['powerEffectScale']??null;
        if($explicit!==null && is_numeric($explicit))return self::clamp((float)$explicit,0,1.5);
        if((int)($part['simpleTier']??0)>0)return 1;
        $category=strtolower((string)($part['categoryKey']??''));
        $sub=strtolower((string)($part['subCategory']??''));
        $id=strtolower((string)($part['catalogId']??''));
        if($category==='engine_kit')return 0;
        if($category==='fuel')return str_contains($sub,'flex')?0.25:0.12;
        if($category==='ecu'){
            if(($part['tuning']['homeGarage']??false)===true || str_contains($sub,'standalone'))return 0;
            if(str_contains($sub,'boost'))return 0.15;
            if(str_contains($sub,'launch'))return 0;
            return (int)($part['buildStage']??1)<=2?0.5:0.3;
        }
        if($category==='engine'){
            $text=$sub.' '.$id;
            if(preg_match('/rod|piston|block|spring|seal|rotor|eccentric/',$text))return 0.08;
            if(preg_match('/cam|head|port|valve/',$text))return 0.7;
            return 0.35;
        }
        if($category==='forced_induction'){
            $role=(string)($part['forcedInduction']['role']??'');
            return $role==='component'?0.8:1;
        }
        if($category==='intake'||$category==='exhaust')return 0.85;
        return 1;
    }

    public static function limitEngineOutput(array $raw,array $envelope,float $overdrive=0): array
    {
        $extra=self::clamp($overdrive,0,0.06);
        $hpCap=(float)($envelope['capacityHp']??$raw['hp']??1)*(1+$extra);
        $tqCap=(float)($envelope['capacityTorque']??$raw['torque']??1)*(1+$extra);
        $hp=self::softLimit((float)($raw['hp']??1),$hpCap,0.82);
        $tq=self::softLimit((float)($raw['torque']??1),$tqCap,0.82);
        $rawHp=(float)($raw['hp']??1);$rawTq=(float)($raw['torque']??1);
        return array_replace($raw,[
            'hp'=>(int)round(max(1,$hp)),
            'torque'=>(int)round(max(1,$tq)),
            'powerLimit'=>[
                'capacityHp'=>(int)round($hpCap),'capacityTorque'=>(int)round($tqCap),
                'rawHp'=>(int)round($rawHp),'rawTorque'=>(int)round($rawTq),
                'hpLimited'=>$rawHp>$hp+1,'torqueLimited'=>$rawTq>$tq+1,
            ],
        ]);
    }

    public static function softLimit(float $value,float $capacity,float $startRatio=0.82): float
    {
        $raw=max(0,$value);$cap=max(1,$capacity);$start=$cap*self::clamp($startRatio,0.5,0.95);
        if($raw<=$start)return $raw;
        $span=max(1,$cap-$start);
        return $start+$span*(1-exp(-($raw-$start)/$span));
    }

    private static function structuralSupportScore(array $specs): int
    {
        $score=0;
        foreach($specs as $part){
            if((string)($part['categoryKey']??'')!=='engine')continue;
            $sub=strtolower((string)($part['subCategory']??''));
            if(preg_match('/rod|piston|block|spring|seal|rotor|eccentric/',$sub))$score++;
        }
        return $score;
    }

    private static function positive(mixed $v): float
    {
        $n=(float)$v;return is_finite($n)&&$n>0?$n:1;
    }
    private static function clamp(float $v,float $min,float $max): float{return min($max,max($min,$v));}
}
