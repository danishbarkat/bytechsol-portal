import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../utils/supabase';
import Icon3D from '../../components/Icon3D';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

export default function AttendanceScreen() {
    const { user } = useAuth();
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRecords = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('attendance_records')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .limit(30);

            if (!error && data) {
                setRecords(data);
            }
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchRecords();
        }, [user])
    );

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        fetchRecords();
    }, []);

    const renderItem = ({ item }: { item: any }) => (
        <View className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm mb-3">
            <View className="flex-row justify-between items-center mb-3">
                <Text className="text-slate-900 font-bold text-lg">{item.date}</Text>
                <View className={`px-3 py-1 rounded-full ${item.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Text className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'Present' ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {item.status || 'Present'}
                    </Text>
                </View>
            </View>
            <View className="flex-row justify-between">
                <View>
                    <Text className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Check In</Text>
                    <Text className="text-slate-700 font-bold text-base">
                        {item.check_in ? new Date(item.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </Text>
                </View>
                <View className="items-end">
                    <Text className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Check Out</Text>
                    <Text className="text-slate-700 font-bold text-base">
                        {item.check_out ? new Date(item.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
            <View className="px-6 pt-4 pb-2">
                <Text className="text-2xl font-black text-slate-900">Attendance History</Text>
            </View>
            <FlatList
                data={records}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                    <View className="items-center justify-center py-20">
                        <Text className="text-slate-400 font-bold">No records found</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}
