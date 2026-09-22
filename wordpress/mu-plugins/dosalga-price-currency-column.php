<?php
/**
 * Plugin Name: Dosalga – Currency importée
 * Description: Ajoute le double contrôle devise Railway/WooCommerce à la liste des produits.
 * Version: 1.0.0
 */

defined('ABSPATH') || exit;

add_filter('manage_edit-product_columns', static function (array $columns): array {
    $result = [];
    foreach ($columns as $key => $label) {
        $result[$key] = $label;
        if ($key === 'price') {
            $result['dosalga_import_currency'] = 'Currency importée';
        }
    }
    return $result;
}, 20);

add_action('manage_product_posts_custom_column', static function (string $column, int $post_id): void {
    if ($column !== 'dosalga_import_currency') {
        return;
    }

    $origin = strtoupper((string) get_post_meta($post_id, 'dosalga_price_origin_currency', true));
    $stored = strtoupper((string) get_post_meta($post_id, 'dosalga_price_value_currency', true));
    if ($origin === '') {
        $origin = strtoupper((string) get_post_meta($post_id, 'dosalga_price_source_currency', true));
    }
    if ($stored === '') {
        $stored = strtoupper((string) get_post_meta($post_id, 'dosalga_price_display_currency', true));
    }

    if (!in_array($origin, ['USD', 'MXN'], true)) {
        echo '<strong style="color:#b91c1c">À vérifier</strong>';
        return;
    }

    printf(
        '<strong>%s</strong><br><small>Prix WP : %s</small>',
        esc_html($origin),
        esc_html(in_array($stored, ['USD', 'MXN'], true) ? $stored : 'À vérifier')
    );
}, 20, 2);
