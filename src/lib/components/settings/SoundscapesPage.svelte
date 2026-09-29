<script lang="ts">
	import SoundscapeMixer from '$lib/components/audio/SoundscapeMixer.svelte';
	import InfoTip from '$lib/components/ui/InfoTip.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte';
</script>

<section class="card" data-setting="soundscape">
	<div class="card-head">
		<span class="card-title">{i18n.t('snd.cardTitle')}</span>
		<InfoTip text={i18n.t('snd.cardTip')} />
	</div>
	<SoundscapeMixer />
</section>
