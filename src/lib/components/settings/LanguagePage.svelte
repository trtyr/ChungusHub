<script lang="ts">
	import { i18n, type Lang } from '$lib/i18n/i18n.svelte';
	import InfoTip from '$lib/components/ui/InfoTip.svelte';
	import Select from '$lib/components/ui/Select.svelte';
</script>

<section class="card" data-setting="interface-language">
	<div class="card-head">
		<span class="card-title">Language / 语言</span>
		<InfoTip text={i18n.t('if.langTip')} />
	</div>
	<div class="card-body">
		<div class="slider-block">
			<label for="interface-language" class="slider-label">语言 / Language</label>
			<Select
				id="interface-language"
				variant="compact"
				class="w-full"
				value={i18n.lang}
				onchange={(e) => i18n.setLang((e.target as HTMLSelectElement).value as Lang)}
			>
				<option value="zh">简体中文</option>
				<option value="en">English</option>
			</Select>
		</div>
	</div>
</section>
