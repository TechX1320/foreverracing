<?php
declare(strict_types=1);

final class Tuning
{
    public static function hardwareProfile(array $car, array $installedSpecs): array
    {
        $standalone = false;
        $engineKitLevel = 0;
        $systems = [];
        $fi = [];

        foreach ($installedSpecs as $part) {
            if (!is_array($part)) continue;
            $tuning = is_array($part['tuning'] ?? null) ? $part['tuning'] : [];
            if (($tuning['homeGarage'] ?? false) === true || (string)($tuning['mode'] ?? '') === 'standalone') $standalone = true;
            $engineKitLevel = max($engineKitLevel, (int)($part['engineKit']['level'] ?? 0));
            $meta = is_array($part['forcedInduction'] ?? null) ? $part['forcedInduction'] : null;
            if ($meta && (string)($meta['role'] ?? '') !== 'nitrous') {
                $fi[] = $part;
                $system = self::normalizeSystem($meta['system'] ?? '');
                if ($system && !in_array($system, $systems, true)) $systems[] = $system;
            }
        }

        $factorySystem = self::normalizeSystem($car['engine']['aspiration'] ?? '');
        if ($factorySystem && $factorySystem !== 'nitrous' && !in_array($factorySystem, $systems, true)) $systems[] = $factorySystem;
        $boosted = in_array('turbo', $systems, true) || in_array('supercharger', $systems, true);
        $factoryBoost = (float)($car['engine']['peakBoostPsi'] ?? $car['engine']['factoryPeakBoostPsi'] ?? 0);
        $maxStep = 0;
        $largerTurbo = false;
        $highFlowBlower = false;
        foreach ($fi as $part) {
            $meta = is_array($part['forcedInduction'] ?? null) ? $part['forcedInduction'] : [];
            $role = (string)($meta['role'] ?? '');
            if ($role === 'kit_upgrade' || $role === 'factory_upgrade') $maxStep = max($maxStep, (int)($meta['step'] ?? 0));
            if ((string)($part['catalogId'] ?? '') === 's3_fi_turbo_upgrade') $largerTurbo = true;
            if ((string)($part['catalogId'] ?? '') === 's3_fi_supercharger_upgrade') $highFlowBlower = true;
        }
        $twinCharge = in_array('turbo', $systems, true) && in_array('supercharger', $systems, true);

        $baseBoost = 0.0;
        if ($boosted) {
            if ($factoryBoost > 0) $baseBoost = $factoryBoost;
            else $baseBoost = in_array('turbo', $systems, true) ? 9.0 : 7.0;
            $baseBoost += $maxStep * 1.5;
            if ($largerTurbo || $highFlowBlower) $baseBoost += 2.5;
            if ($twinCharge) $baseBoost += 2.0;
        }

        $stage = (int)($car['buildStage'] ?? 1);
        $safeHeadroom = 3.0 + ($engineKitLevel * 2.2) + ($stage >= 4 ? 1.5 : 0.0);
        $safeBoost = $boosted ? self::clamp($baseBoost + $safeHeadroom, 6, 32) : 0.0;
        $maxBoost = $boosted ? self::clamp($safeBoost + 6, 8, 38) : 0.0;
        $minBoost = $boosted ? self::clamp($baseBoost - 7, 2, $maxBoost) : 0.0;

        return [
            'unlocked' => $standalone,
            'standalone' => $standalone,
            'boosted' => $boosted,
            'systems' => $systems,
            'engineKitLevel' => $engineKitLevel,
            'powerEnvelope' => PowerModel::enginePowerEnvelope($car, $installedSpecs),
            'baseBoostPsi' => round($baseBoost, 1),
            'safeBoostPsi' => round($safeBoost, 1),
            'minBoostPsi' => round($minBoost, 1),
            'maxBoostPsi' => round($maxBoost, 1),
        ];
    }

    public static function defaultProfile(array $car, array $hardware): array
    {
        $redline = max(4000.0, (float)($car['engine']['redlineRpm'] ?? 7000));
        $revCut = max($redline, (float)($car['engine']['revCutRpm'] ?? ($redline + 500)));
        $peakHp = (float)($car['engine']['peakHpRpm'] ?? 0);
        $shiftBase = $peakHp > 0 ? min($revCut - 100, $peakHp + 250) : round($redline * 0.96);
        return [
            'version' => 1,
            'boostPsi' => !empty($hardware['boosted']) ? round((float)($hardware['baseBoostPsi'] ?? 0), 1) : 0,
            'boostByGear' => [100,100,100,100,100,100],
            'fuelTrimPct' => 0,
            'ignitionAdvanceDeg' => 0,
            'launchRpm' => (int)(round(self::clamp($redline * 0.52, 2200, 5200) / 100) * 100),
            'shiftRpm' => (int)(round(self::clamp($shiftBase, 3500, $revCut) / 100) * 100),
            'tirePsiFront' => 32,
            'tirePsiRear' => 32,
            'savedAt' => null,
        ];
    }

    public static function normalizeProfile(mixed $input, array $car, array $hardware): array
    {
        $defaults = self::defaultProfile($car, $hardware);
        $source = is_array($input) ? $input : [];
        $redline = max(4000.0, (float)($car['engine']['redlineRpm'] ?? 7000));
        $revCut = max($redline, (float)($car['engine']['revCutRpm'] ?? ($redline + 500)));
        $gearSource = is_array($source['boostByGear'] ?? null) ? $source['boostByGear'] : $defaults['boostByGear'];
        $gears = [];
        for ($i=0;$i<6;$i++) $gears[] = (int)round(self::clamp((float)($gearSource[$i] ?? 100),45,100));

        return [
            'version' => 1,
            'boostPsi' => !empty($hardware['boosted'])
                ? round(self::clamp((float)($source['boostPsi'] ?? $defaults['boostPsi']), (float)($hardware['minBoostPsi'] ?? 0), (float)($hardware['maxBoostPsi'] ?? 0)), 1)
                : 0,
            'boostByGear' => $gears,
            'fuelTrimPct' => round(self::clamp((float)($source['fuelTrimPct'] ?? 0), -10, 18),1),
            'ignitionAdvanceDeg' => round(self::clamp((float)($source['ignitionAdvanceDeg'] ?? 0), -5, 7),1),
            'launchRpm' => (int)(round(self::clamp((float)($source['launchRpm'] ?? $defaults['launchRpm']),1800,max(2200,$redline))/100)*100),
            'shiftRpm' => (int)(round(self::clamp((float)($source['shiftRpm'] ?? $defaults['shiftRpm']),3000,$revCut)/100)*100),
            'tirePsiFront' => round(self::clamp((float)($source['tirePsiFront'] ?? 32),12,42),1),
            'tirePsiRear' => round(self::clamp((float)($source['tirePsiRear'] ?? 32),12,42),1),
            'savedAt' => (int)($source['savedAt'] ?? 0) ?: null,
        ];
    }

    public static function fingerprint(array $car): array
    {
        $hash = self::stableHash((string)($car['carId'] ?? $car['catalogId'] ?? $car['stockId'] ?? 'car'));
        $unit = static fn(int $shift): float => (((($hash >> $shift) & 0xff) / 255.0) * 2.0) - 1.0;
        return [
            'fuelBias' => round($unit(0) * 1.6,2),
            'timingBias' => round($unit(8) * 0.75,2),
            'frontPsiBias' => round($unit(16) * 1.2,2),
            'rearPsiBias' => round($unit(24) * 1.2,2),
            'launchBiasRpm' => (int)round($unit(4) * 350),
            'shiftBiasRpm' => (int)round($unit(12) * 220),
            'airflowBias' => round(0.97 + (((($hash >> 20) & 0x0f) / 15.0) * 0.06),3),
        ];
    }

    public static function evaluate(array $car, array $untunedStats, mixed $inputProfile, array $hardware): array
    {
        $profile = self::normalizeProfile($inputProfile,$car,$hardware);
        $fp = self::fingerprint($car);
        $base = [
            'hp'=>max(1.0,(float)($untunedStats['hp'] ?? 1)),
            'torque'=>max(1.0,(float)($untunedStats['torque'] ?? 1)),
            'weight'=>max(500.0,(float)($untunedStats['weight'] ?? 500)),
            'grip'=>max(0.5,(float)($untunedStats['grip'] ?? 1)),
            'drivetrain'=>(string)($untunedStats['drivetrain'] ?? $car['base']['drivetrain'] ?? ''),
        ];

        $boostDelta = !empty($hardware['boosted']) ? (float)$profile['boostPsi'] - (float)($hardware['baseBoostPsi'] ?? 0) : 0.0;
        $pressureRatio = !empty($hardware['boosted'])
            ? pow((14.7 + (float)$profile['boostPsi']) / max(8.0,14.7 + (float)($hardware['baseBoostPsi'] ?? 0)),0.82)
            : 1.0;

        $fuelTarget = self::clamp(1.2 + max(0,$boostDelta)*0.34 + (float)$fp['fuelBias'],-2,10);
        $fuelNeutralScore = self::bellScore(0 - self::clamp(1.2 + (float)$fp['fuelBias'],-2,10),4.2);
        $fuelError = (float)$profile['fuelTrimPct'] - $fuelTarget;
        $fuelScore = self::bellScore($fuelError,4.2);
        $leanSeverity = self::clamp((-$fuelError - 1.2)/6.5,0,1);
        $richSeverity = self::clamp(($fuelError - 2.2)/8.0,0,1);
        $fuelMultiplier = self::clamp(1 + (($fuelScore-$fuelNeutralScore)*0.045) - ($leanSeverity*0.055) - ($richSeverity*0.025),0.9,1.05);

        $timingTarget = self::clamp(0.7 - max(0,$boostDelta)*0.11 + (float)$fp['timingBias'],-2.5,2.5);
        $timingNeutralScore = self::bellScore(0 - self::clamp(0.7 + (float)$fp['timingBias'],-2.5,2.5),2.6);
        $timingError = (float)$profile['ignitionAdvanceDeg'] - $timingTarget;
        $timingScore = self::bellScore($timingError,2.6);
        $timingOver = self::clamp(($timingError-0.6)/4.2,0,1);
        $timingMultiplier = self::clamp(1 + (($timingScore-$timingNeutralScore)*0.04) - ($timingOver*0.05),0.91,1.045);

        $boostOver = !empty($hardware['boosted'])
            ? self::clamp(((float)$profile['boostPsi']-(float)($hardware['safeBoostPsi'] ?? $profile['boostPsi'])) / max(2.0,(float)($hardware['maxBoostPsi'] ?? $profile['boostPsi'])-(float)($hardware['safeBoostPsi'] ?? $profile['boostPsi'])),0,1)
            : 0.0;
        $stress = self::clamp(($boostOver*0.55)+($leanSeverity*0.3)+($timingOver*0.35),0,1);
        $safetyPull = 1 - ($stress*0.11);
        $powerMultiplier = self::clamp($pressureRatio*$fuelMultiplier*$timingMultiplier*(float)$fp['airflowBias']*$safetyPull,0.72,1.45);
        $torqueMultiplier = self::clamp(pow($pressureRatio,1.04)*$fuelMultiplier*(1+(($timingMultiplier-1)*0.75))*(float)$fp['airflowBias']*$safetyPull,0.72,1.5);

        $tire = self::tireEvaluation($car,$base,$profile,$fp);
        $launch = self::launchEvaluation($car,$base,$profile,$fp);
        $shift = self::shiftEvaluation($car,$profile,$fp);
        $gear = self::gearEvaluation($profile,$base,(float)$tire['gripMultiplier']);

        $preLimit = [
            'hp'=>(int)round(max(1,$base['hp']*$powerMultiplier)),
            'torque'=>(int)round(max(1,$base['torque']*$torqueMultiplier)),
            'weight'=>(int)round($base['weight']),
            'grip'=>round(max(0.5,$base['grip']*(float)$tire['gripMultiplier']),3),
            'drivetrain'=>$base['drivetrain'],
        ];
        $limited = PowerModel::limitEngineOutput(
            $preLimit,
            is_array($hardware['powerEnvelope'] ?? null) ? $hardware['powerEnvelope'] : PowerModel::enginePowerEnvelope($car, []),
            $stress * 0.04
        );
        $derived = [
            'hp'=>(int)$limited['hp'],
            'torque'=>(int)$limited['torque'],
            'weight'=>$preLimit['weight'],
            'grip'=>$preLimit['grip'],
            'drivetrain'=>$preLimit['drivetrain'],
        ];

        $stability = self::clamp(1-($stress*0.65)-(max(0,abs($fuelError)-3)*0.025)-(max(0,$timingError-1.2)*0.04),0.35,1);
        $hints = self::buildHints($profile,$hardware,$fuelError,$timingError,$tire,$launch,$shift,$gear,$stress,!empty($limited['powerLimit']['hpLimited']));
        return [
            'profile'=>$profile,
            'hardware'=>$hardware,
            'fingerprint'=>$fp,
            'derived'=>$derived,
            'diagnostics'=>[
                'riskPct'=>(int)round($stress*100),
                'stabilityPct'=>(int)round($stability*100),
                'fuelState'=>$fuelError < -1.2 ? 'LEAN' : ($fuelError > 2.2 ? 'RICH' : 'IN RANGE'),
                'timingState'=>$timingError > 1.1 ? 'AGGRESSIVE' : ($timingError < -1.8 ? 'CONSERVATIVE' : 'IN RANGE'),
                'tireState'=>$tire['state'],
                'launchState'=>$launch['state'],
                'shiftState'=>$shift['state'],
                'powerState'=>!empty($limited['powerLimit']['hpLimited']) ? 'ENGINE-LIMITED' : 'HEADROOM',
                'powerLimit'=>$limited['powerLimit'] ?? null,
                'hints'=>$hints,
            ],
            'race'=>[
                'active'=>true,
                'stability'=>$stability,
                'stress'=>$stress,
                'boostPsi'=>$profile['boostPsi'],
                'boostByGear'=>$profile['boostByGear'],
                'launchPowerFactor'=>$gear['launchPowerFactor'],
                'averagePowerFactor'=>$gear['averagePowerFactor'],
                'launchEtModifier'=>$launch['etModifier'],
                'shiftPenaltySec'=>$shift['penaltySec'],
                'rollingPenaltySec'=>$tire['rollingPenaltySec'],
                'tractionMultiplier'=>$gear['tractionMultiplier'],
                'tuneLabel'=>$stress >= 0.72 ? 'ON THE EDGE' : ($stress >= 0.4 ? 'AGGRESSIVE' : 'STABLE'),
            ],
        ];
    }

    private static function tireEvaluation(array $car,array $stats,array $profile,array $fp): array
    {
        $drive = strtoupper((string)($stats['drivetrain'] ?? $car['base']['drivetrain'] ?? ''));
        $weightAdjust = self::clamp(((float)($stats['weight'] ?? 3000)-3000)/1200,-0.8,0.8);
        $front=28.0;$rear=24.0;
        if($drive==='RWD'){ $front=30.5;$rear=18.5; }
        elseif($drive==='FWD'){ $front=20.5;$rear=30.5; }
        elseif($drive==='AWD'){ $front=24;$rear=24; }
        $front += ($weightAdjust*1.1)+(float)$fp['frontPsiBias'];
        $rear += ($weightAdjust*0.9)+(float)$fp['rearPsiBias'];
        $score=(self::bellScore((float)$profile['tirePsiFront']-$front,8.5)+self::bellScore((float)$profile['tirePsiRear']-$rear,8.5))/2;
        $neutral=(self::bellScore(32-$front,8.5)+self::bellScore(32-$rear,8.5))/2;
        $grip=self::clamp(1+(($score-$neutral)*0.11),0.91,1.11);
        $tooLow=max(0,15-min((float)$profile['tirePsiFront'],(float)$profile['tirePsiRear']));
        $pen=round($tooLow*0.012,3);
        $err=(abs((float)$profile['tirePsiFront']-$front)+abs((float)$profile['tirePsiRear']-$rear))/2;
        return ['gripMultiplier'=>$grip,'rollingPenaltySec'=>$pen,'state'=>$err<=2.2?'DIALED IN':($err<=5?'WORKABLE':'OFF TARGET')];
    }

    private static function launchEvaluation(array $car,array $stats,array $profile,array $fp): array
    {
        $drive=strtoupper((string)($stats['drivetrain'] ?? $car['base']['drivetrain'] ?? ''));
        $redline=max(4000.0,(float)($car['engine']['redlineRpm'] ?? 7000));
        $load=self::clamp(((float)($stats['torque'] ?? 1)/max(500,(float)($stats['weight'] ?? 3000)))*1000,40,500);
        $base=$drive==='AWD'?0.57:($drive==='FWD'?0.48:0.53);
        $target=self::clamp(($redline*$base)-(($load-120)*2.2)+(float)$fp['launchBiasRpm'],1900,$redline*0.82);
        $error=(float)$profile['launchRpm']-$target;
        $abs=abs($error);
        $pen=self::clamp(($abs/3500)*0.15,0,0.18);
        $reward=$abs<250?0.035*(1-$abs/250):0;
        return ['etModifier'=>round($pen-$reward,3),'state'=>$error>550?'TOO HIGH':($error<-550?'BOGGING':'CLOSE')];
    }

    private static function shiftEvaluation(array $car,array $profile,array $fp): array
    {
        $redline=max(4000.0,(float)($car['engine']['redlineRpm'] ?? 7000));
        $revCut=max($redline,(float)($car['engine']['revCutRpm'] ?? $redline+500));
        $peak=(float)($car['engine']['peakHpRpm'] ?? 0);
        $target=self::clamp(($peak>0?$peak+250:$redline*0.96)+(float)$fp['shiftBiasRpm'],3500,$revCut-50);
        $error=(float)$profile['shiftRpm']-$target;
        return ['penaltySec'=>round(self::clamp(abs($error)/8000,0,0.16),3),'state'=>$error>450?'SHIFTING LATE':($error<-450?'SHIFTING EARLY':'CLOSE')];
    }

    private static function gearEvaluation(array $profile,array $stats,float $tireGrip): array
    {
        $gears=array_map(fn($v):float=>self::clamp((float)$v/100,0.45,1),$profile['boostByGear']);
        $launch=self::clamp(($gears[0]*0.72)+($gears[1]*0.28),0.45,1);
        $avg=self::clamp(($gears[0]*0.18)+($gears[1]*0.18)+($gears[2]*0.18)+($gears[3]*0.17)+($gears[4]*0.15)+($gears[5]*0.14),0.45,1);
        $powerToGrip=((float)($stats['hp']??1)/max(500,(float)($stats['weight']??3000)))/max(0.5,(float)($stats['grip']??1)*$tireGrip);
        $ideal=self::clamp(1.06-($powerToGrip*0.52),0.52,1);
        return ['launchPowerFactor'=>$launch,'averagePowerFactor'=>$avg,'tractionMultiplier'=>self::clamp($launch/max(0.5,$ideal),0.65,1.35)];
    }

    private static function buildHints(array $profile,array $hardware,float $fuelError,float $timingError,array $tire,array $launch,array $shift,array $gear,float $stress,bool $powerLimited=false): array
    {
        $h=[];
        if(!empty($hardware['boosted']) && (float)$profile['boostPsi']>(float)($hardware['safeBoostPsi']??0))$h[]="Boost is above the engine hardware's comfortable window. It may make more power, but repeatability falls.";
        if($powerLimited)$h[]='The engine is near its current power envelope. More boost now gives diminishing returns; stronger engine hardware or a larger engine is the meaningful next step.';
        if($fuelError<-1.2)$h[]='Fueling is lean for the current boost. Add fuel before asking for more boost or timing.';
        elseif($fuelError>2.2)$h[]='Fueling is rich enough to start giving power away.';
        else $h[]='Fueling is in a usable window for this car.';
        if($timingError>1.1)$h[]='Ignition timing is aggressive for this specific engine. Watch for timing pull.';
        elseif($timingError<-1.8)$h[]='Ignition timing is conservative; there may be power left on the table.';
        if(($tire['state']??'')!=='DIALED IN')$h[]='Tire pressure can still improve launch grip. Front and rear do not necessarily want the same pressure.';
        if(($launch['state']??'')==='TOO HIGH')$h[]='Launch RPM is pushing the tire harder than this setup wants.';
        if(($launch['state']??'')==='BOGGING')$h[]='Launch RPM is low enough to give away the first part of the run.';
        if(($shift['state']??'')!=='CLOSE')$h[]="Shift RPM is outside the strongest part of this engine's current powerband.";
        if((float)($gear['launchPowerFactor']??1)<0.97)$h[]='Boost-by-gear is reducing early power. That can be faster when the car is traction-limited, but slower when it already hooks.';
        if($stress>0.65)$h[]='This calibration is on the edge: some passes may pull power even when the peak dyno number looks better.';
        return array_slice($h,0,5);
    }

    private static function normalizeSystem(mixed $value): ?string
    {
        $text=strtolower(trim((string)$value));
        if(str_contains($text,'super'))return 'supercharger';
        if(str_contains($text,'turbo'))return 'turbo';
        if(str_contains($text,'nitrous')||str_contains($text,'nos'))return 'nitrous';
        return null;
    }

    private static function bellScore(float $error,float $width): float
    {
        $r=$error/max(0.001,$width);
        return exp(-($r*$r));
    }

    private static function stableHash(string $text): int
    {
        $hash=2166136261;
        $len=strlen($text);
        for($i=0;$i<$len;$i++){
            $hash ^= ord($text[$i]);
            $hash = (int)(($hash * 16777619) & 0xFFFFFFFF);
        }
        return $hash;
    }

    private static function clamp(float $value,float $min,float $max): float
    {
        return min($max,max($min,$value));
    }
}
