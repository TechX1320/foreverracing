<?php
declare(strict_types=1);

final class EngineSwap
{
    public const ENGINE_BOUND_CATEGORIES = [
        'intake','exhaust','ecu','fuel','drivetrain','forced_induction','engine_kit','engine',
    ];

    public static function eligible(array $engine): bool
    {
        if (($engine['swapMarket']['available'] ?? true) === false) return false;
        return trim((string)($engine['engineId'] ?? '')) !== ''
            && (float)($engine['peakHp'] ?? 0) > 0
            && (float)($engine['peakTorque'] ?? 0) > 0
            && (float)($engine['redlineRpm'] ?? 0) > 0
            && (float)($engine['revCutRpm'] ?? 0) >= (float)($engine['redlineRpm'] ?? 0);
    }

    public static function price(array $engine): int
    {
        $authored=(int)($engine['swapMarket']['price'] ?? 0);
        if($authored>0)return $authored;
        $fallback=((float)($engine['peakHp']??0)*28)+((float)($engine['displacementLiters']??0)*1800);
        return max(4500,(int)(round($fallback/500)*500));
    }

    public static function fitment(array $car,array $engine): array
    {
        $source=is_array($car['engineSwapFitment']??null)?$car['engineSwapFitment']:[];
        $options=is_array($source['options']??null)?$source['options']:[];
        $engineId=(string)($engine['engineId']??'');
        $authored=is_array($options[$engineId]??null)?$options[$engineId]:null;
        $factory=(string)($car['factoryEngineId']??'')===$engineId;
        if(!$authored&&!$factory){
            return [
                'allowed'=>false,
                'minBuildStage'=>max(2,(int)($source['minBuildStage']??2)),
                'fitment'=>'NO FITMENT','installCost'=>0,
                'note'=>'No chassis fitment has been authored for this engine.',
            ];
        }
        $fitment=$authored??[];
        return [
            'allowed'=>($fitment['allowed']??true)!==false,
            'minBuildStage'=>max(2,(int)($fitment['minBuildStage']??$source['minBuildStage']??2)),
            'fitment'=>strtoupper((string)($fitment['fitment']??($factory?'FACTORY':'CUSTOM'))),
            'installCost'=>max(0,(int)round((float)($fitment['installCost']??($factory?2500:7500)))),
            'note'=>(string)($fitment['note']??($factory
                ? 'Factory engine fitment. Reinstallation still requires swap labor and fresh setup.'
                : 'Custom mounts, plumbing, wiring and driveline adaptation are included in the installation cost.')),
        ];
    }

    public static function isEngineBoundPart(array $part): bool
    {
        return in_array(strtolower((string)($part['categoryKey']??'')),self::ENGINE_BOUND_CATEGORIES,true);
    }

    public static function snapshot(array $engine,array $existing=[]): array
    {
        $layout=$existing['layout']??null;
        return array_filter([
            'engineId'=>(string)($engine['engineId']??''),
            'manufacturer'=>(string)($engine['manufacturer']??''),
            'familyName'=>(string)($engine['familyName']??$engine['name']??''),
            'variantName'=>(string)($engine['variantName']??''),
            'name'=>(string)($engine['name']??''),
            'displacementLiters'=>(float)($engine['displacementLiters']??0),
            'configuration'=>(string)($engine['configuration']??''),
            'aspiration'=>(string)($engine['aspiration']??''),
            'peakBoostPsi'=>$engine['peakBoostPsi']??null,
            'peakHp'=>(int)($engine['peakHp']??0),
            'peakHpRpm'=>(int)($engine['peakHpRpm']??0),
            'peakTorque'=>(int)($engine['peakTorque']??0),
            'peakTorqueRpm'=>(int)($engine['peakTorqueRpm']??0),
            'powerLimits'=>is_array($engine['powerLimits']??null)?$engine['powerLimits']:[],
            'redlineRpm'=>(int)($engine['redlineRpm']??0),
            'revCutRpm'=>(int)($engine['revCutRpm']??0),
            'curveProfile'=>(string)($engine['curveProfile']??''),
            'curveNotes'=>(string)($engine['curveNotes']??''),
            'powerCurve'=>is_array($engine['powerCurve']??null)?$engine['powerCurve']:[],
            'tags'=>is_array($engine['tags']??null)?array_values($engine['tags']):[],
            'layout'=>$layout,
        ],static fn($value)=>$value!==null);
    }

    public static function healthyCondition(array $previous=[]): array
    {
        return [
            'healthPct'=>100,'failed'=>false,
            'failures'=>(int)($previous['failures']??0),
            'lastFailureAt'=>$previous['lastFailureAt']??null,
            'repairedAt'=>$previous['repairedAt']??null,
        ];
    }

    public static function normalizeAssembly(array $item=[]): array
    {
        $parts=array_values(array_unique(array_filter(array_map(
            fn($id): string => trim((string)$id),
            is_array($item['attachedPartInventoryIds']??null)?$item['attachedPartInventoryIds']:[]
        ))));
        $stats=is_array($item['storedStats']??null)?[
            'hp'=>max(1,(int)round((float)($item['storedStats']['hp']??1))),
            'torque'=>max(1,(int)round((float)($item['storedStats']['torque']??1))),
        ]:null;
        return [
            'inventoryId'=>(string)($item['inventoryId']??''),
            'engineId'=>(string)($item['engineId']??''),
            'installedOnCarId'=>!empty($item['installedOnCarId'])?(string)$item['installedOnCarId']:null,
            'acquiredAt'=>(int)($item['acquiredAt']??0),
            'source'=>(string)($item['source']??'owned'),
            'condition'=>self::storedCondition(is_array($item['condition']??null)?$item['condition']:[]),
            'attachedPartInventoryIds'=>$parts,
            'tune'=>is_array($item['tune']??null)?$item['tune']:null,
            'storedStats'=>$stats,
        ];
    }

    public static function storedCondition(array $source=[]): array
    {
        return [
            'healthPct'=>max(0,min(100,(int)($source['healthPct']??100))),
            'failed'=>!empty($source['failed']),
            'failures'=>max(0,(int)($source['failures']??0)),
            'lastFailureAt'=>$source['lastFailureAt']??null,
            'repairedAt'=>$source['repairedAt']??null,
        ];
    }
}
